class CalendarEvent {
  const CalendarEvent({
    required this.id,
    required this.title,
    required this.at,
    required this.done,
  });

  final String id;
  final String title;
  final int at;
  final bool done;

  factory CalendarEvent.fromJson(Map<String, dynamic> json) {
    return CalendarEvent(
      id: json['id'] as String,
      title: json['title'] as String,
      at: (json['at'] as num).toInt(),
      done: json['done'] == true,
    );
  }
}

class MirrorStatus {
  const MirrorStatus({
    required this.online,
    required this.active,
    required this.lamp,
    required this.screenBrightness,
    required this.lightSensor,
    required this.temperature,
    required this.humidity,
  });

  final bool online;
  final bool active;
  final String? lamp;
  final int? screenBrightness;
  final String? lightSensor;
  final double? temperature;
  final double? humidity;

  factory MirrorStatus.fromJson(Map<String, dynamic>? json) {
    return MirrorStatus(
      online: json?['online'] == true,
      active: json?['active'] == true,
      lamp: json?['lamp'] as String?,
      screenBrightness: (json?['screenBrightness'] as num?)?.toInt(),
      lightSensor: json?['lightSensor'] as String?,
      temperature: (json?['temperature'] as num?)?.toDouble(),
      humidity: (json?['humidity'] as num?)?.toDouble(),
    );
  }
}

class CalendarSnapshot {
  const CalendarSnapshot({required this.events, required this.mirror});

  final List<CalendarEvent> events;
  final MirrorStatus mirror;
}
