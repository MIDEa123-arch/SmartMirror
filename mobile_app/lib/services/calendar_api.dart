import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';

import '../models/calendar_event.dart';

class CalendarApi {
  CalendarApi._(this._token, this._client);

  static final _calendarUri = Uri.parse('https://127.0.0.1:1881/api/calendar');
  final String _token;
  final HttpClient _client;

  static Future<CalendarApi> create(String token) async {
    final cert = await rootBundle.load('assets/local-server-cert.pem');
    final trust = SecurityContext(withTrustedRoots: false)
      ..setTrustedCertificatesBytes(cert.buffer.asUint8List());
    final client = HttpClient(context: trust)
      ..connectionTimeout = const Duration(seconds: 6);
    return CalendarApi._(token, client);
  }

  Future<CalendarSnapshot> fetchSnapshot() async {
    final json = await _request('GET', _calendarUri);
    final values = json['tasks'];
    if (values is! List) {
      throw const FormatException('Không đọc được danh sách lịch.');
    }
    final events = values
        .whereType<Map<String, dynamic>>()
        .map(CalendarEvent.fromJson)
        .toList()
      ..sort((a, b) => a.at.compareTo(b.at));
    return CalendarSnapshot(
      events: events,
      mirror: MirrorStatus.fromJson(json['device'] as Map<String, dynamic>?),
    );
  }

  Future<CalendarEvent> createEvent(String title, int at) async {
    final result = await _request('POST', _calendarUri, {
      'title': title,
      'at': at,
    });
    return CalendarEvent.fromJson(result['task'] as Map<String, dynamic>);
  }

  Future<CalendarEvent> updateEvent(CalendarEvent event) async {
    final uri = _calendarUri.replace(
      path: '${_calendarUri.path}/${Uri.encodeComponent(event.id)}',
    );
    final result = await _request('PUT', uri, {
      'title': event.title,
      'at': event.at,
      'done': event.done,
    });
    return CalendarEvent.fromJson(result['task'] as Map<String, dynamic>);
  }

  Future<void> deleteEvent(String id) async {
    final uri = _calendarUri.replace(
      path: '${_calendarUri.path}/${Uri.encodeComponent(id)}',
    );
    await _request('DELETE', uri);
  }

  Future<Map<String, dynamic>> _request(
    String method,
    Uri uri, [
    Map<String, dynamic>? body,
  ]) async {
    try {
      final request = await _client
          .openUrl(method, uri)
          .timeout(const Duration(seconds: 10));
      request.headers.set(HttpHeaders.acceptHeader, 'application/json');
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $_token');
      if (body != null) {
        request.headers.contentType = ContentType.json;
        request.write(jsonEncode(body));
      }
      final response = await request.close().timeout(
        const Duration(seconds: 10),
      );
      final text = await response
          .transform(utf8.decoder)
          .join()
          .timeout(const Duration(seconds: 10));
      final decoded = text.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(text) as Map<String, dynamic>;
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw HttpException(decoded['error']?.toString() ?? 'Không thể cập nhật lịch lúc này.');
      }
      return decoded;
    } on SocketException {
      throw const HttpException('Không kết nối được với gương. Kiểm tra nguồn và kết nối.');
    } on HttpException {
      rethrow;
    } on FormatException {
      throw const HttpException('Không đọc được dữ liệu từ gương.');
    }
  }

  void close() => _client.close(force: true);
}
