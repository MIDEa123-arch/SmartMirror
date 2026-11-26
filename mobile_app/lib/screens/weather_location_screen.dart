import 'dart:io';

import 'package:flutter/material.dart';

import '../services/calendar_api.dart';

class WeatherLocationScreen extends StatefulWidget {
  const WeatherLocationScreen({super.key, required this.api});

  final CalendarApi api;

  @override
  State<WeatherLocationScreen> createState() => _WeatherLocationScreenState();
}

class _WeatherLocationScreenState extends State<WeatherLocationScreen> {
  List<WeatherPlace> _places = [];
  String? _location;
  String? _message;
  bool _busy = true;

  @override
  void initState() {
    super.initState();
    _run(() async {
      final location = await widget.api.weatherLocation();
      if (mounted) setState(() => _location = location);
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await action();
    } catch (error) {
      if (mounted) {
        setState(
          () => _message = error is HttpException
              ? error.message
              : 'Không thể cập nhật vị trí lúc này.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Vị trí thời tiết')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(_location ?? 'Chưa chọn địa điểm cho gương'),
          const SizedBox(height: 16),
          TextField(
            enabled: !_busy,
            maxLength: 80,
            textInputAction: TextInputAction.search,
            decoration: const InputDecoration(
              labelText: 'Tìm tỉnh hoặc thành phố',
              prefixIcon: Icon(Icons.search),
            ),
            onSubmitted: (value) {
              final query = value.trim();
              if (query.length < 2) {
                setState(() => _message = 'Nhập ít nhất 2 ký tự.');
                return;
              }
              _run(() async {
                final places = await widget.api.searchWeatherPlaces(query);
                if (mounted) {
                  setState(() {
                    _places = places;
                    if (places.isEmpty) _message = 'Không tìm thấy địa điểm.';
                  });
                }
              });
            },
          ),
          if (_busy) const LinearProgressIndicator(),
          if (_message != null) Text(_message!),
          for (final place in _places)
            ListTile(
              leading: const Icon(Icons.place_outlined),
              title: Text(place.name),
              enabled: !_busy,
              onTap: () => _run(() async {
                await widget.api.setWeatherLocation(place);
                if (mounted) {
                  setState(() {
                    _location = place.name;
                    _places = [];
                    _message = 'Đã lưu vị trí cho gương.';
                  });
                }
              }),
            ),
        ],
      ),
    );
  }
}
