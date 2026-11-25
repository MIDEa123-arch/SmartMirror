import 'package:flutter_test/flutter_test.dart';
import 'package:smartmirror_app/models/calendar_event.dart';

void main() {
  test('parses a calendar event returned by Node-RED', () {
    final event = CalendarEvent.fromJson({
      'id': '1740000000000-ab12cd',
      'title': 'Họp nhóm',
      'at': 1740000000000,
      'done': false,
    });

    expect(event.id, '1740000000000-ab12cd');
    expect(event.title, 'Họp nhóm');
    expect(event.at, 1740000000000);
    expect(event.done, isFalse);
  });

  test('treats a completed event as completed', () {
    final event = CalendarEvent.fromJson({
      'id': 'finished',
      'title': 'Tập thể dục',
      'at': 1740000000000,
      'done': true,
    });

    expect(event.done, isTrue);
  });
}
