import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/calendar_event.dart';
import '../services/calendar_api.dart';
import 'weather_location_screen.dart';

const _teal = Color(0xFF176B5B);
const _muted = Color(0xFF71817C);
const _months = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
];
const _weekdayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

DateTime _vietnamNow() {
  final now = DateTime.now().toUtc().add(const Duration(hours: 7));
  return DateTime.utc(now.year, now.month, now.day);
}

DateTime _vietnamDate(int epochMilliseconds) =>
    DateTime.fromMillisecondsSinceEpoch(
      epochMilliseconds,
      isUtc: true,
    ).add(const Duration(hours: 7));

String _dateLabel(DateTime date) =>
    '${date.day} ${_months[date.month - 1].toLowerCase()} ${date.year}';

class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> with WidgetsBindingObserver {
  static const _secureStorage = FlutterSecureStorage();
  late DateTime _today;
  late DateTime _selectedDay;
  late DateTime _visibleMonth;
  CalendarApi? _api;
  String _pairingCode = '';
  List<CalendarEvent> _events = [];
  MirrorStatus _mirror = const MirrorStatus(
    online: false,
    active: false,
    lamp: null,
    screenBrightness: null,
    lightSensor: null,
    temperature: null,
    humidity: null,
  );
  bool _loading = true;
  bool _busy = false;
  String? _error;
  Timer? _refreshTimer;
  int _requestId = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _today = _vietnamNow();
    _selectedDay = _today;
    _visibleMonth = DateTime.utc(_today.year, _today.month);
    _initialize();
  }

  Future<void> _initialize() async {
    _pairingCode = await _secureStorage.read(key: 'pairingCode') ?? '';
    final api = await CalendarApi.create(_pairingCode);
    if (!mounted) {
      api.close();
      return;
    }
    _api = api;
    await _refresh();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _refreshTimer?.cancel();
    if (state == AppLifecycleState.resumed && _api != null) {
      _refresh(quiet: true);
    }
  }

  Future<void> _refresh({bool quiet = false}) async {
    final api = _api;
    if (api == null) return;
    _refreshTimer?.cancel();
    final requestId = ++_requestId;
    if (!quiet) setState(() => _loading = _events.isEmpty);
    try {
      final snapshot = await api.fetchSnapshot();
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _error = null;
        _events = snapshot.events;
        _mirror = snapshot.mirror;
      });
    } catch (error) {
      if (!mounted || requestId != _requestId) return;
      setState(
        () => _error = error.toString().replaceFirst('HttpException: ', ''),
      );
    } finally {
      if (mounted && requestId == _requestId) {
        if (_loading) setState(() => _loading = false);
        if (_pairingCode.isNotEmpty &&
            WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
          _refreshTimer = Timer(const Duration(seconds: 5), () => _refresh(quiet: true));
        }
      }
    }
  }

  List<CalendarEvent> get _selectedEvents => _events.where((event) {
    final date = _vietnamDate(event.at);
    return date.year == _selectedDay.year &&
        date.month == _selectedDay.month &&
        date.day == _selectedDay.day;
  }).toList()..sort((a, b) => a.at.compareTo(b.at));

  List<DateTime> get _calendarDays {
    final first = DateTime.utc(_visibleMonth.year, _visibleMonth.month, 1);
    final mondayOffset = first.weekday - 1;
    final start = first.subtract(Duration(days: mondayOffset));
    return List.generate(42, (index) => start.add(Duration(days: index)));
  }

  int _eventCount(DateTime day) => _events.where((event) {
    final date = _vietnamDate(event.at);
    return date.year == day.year &&
        date.month == day.month &&
        date.day == day.day;
  }).length;

  Future<void> _changeMonth(int offset) async {
    setState(() {
      _visibleMonth = DateTime.utc(
        _visibleMonth.year,
        _visibleMonth.month + offset,
      );
    });
  }

  void _goToday() {
    final today = _vietnamNow();
    setState(() {
      _today = today;
      _selectedDay = today;
      _visibleMonth = DateTime.utc(today.year, today.month);
    });
  }

  Future<void> _savePairingCode(String value) async {
    final token = value.trim();
    if (token.length < 32) {
      _showMessage('Mã kết nối chưa đúng. Hãy kiểm tra mã trên máy tính.');
      return;
    }
    await _secureStorage.write(key: 'pairingCode', value: token);
    final api = await CalendarApi.create(token);
    _api?.close();
    setState(() {
      _pairingCode = token;
      _api = api;
    });
    if (mounted) Navigator.pop(context);
    await _refresh();
  }

  Future<void> _openSettings() async {
    var pairingCode = _pairingCode;
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Kết nối gương'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Nhập mã kết nối hiển thị trên máy tính khi khởi động gương. Mã được lưu an toàn trên điện thoại.'),
            const SizedBox(height: 16),
            TextFormField(
              initialValue: _pairingCode,
              onChanged: (value) => pairingCode = value,
              obscureText: true,
              autocorrect: false,
              enableSuggestions: false,
              decoration: const InputDecoration(labelText: 'Mã kết nối', hintText: 'Nhập mã trên máy tính'),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Vị trí thời tiết',
            onPressed: _api == null
                ? null
                : () => Navigator.of(context).push(MaterialPageRoute<void>(
                    builder: (_) => WeatherLocationScreen(api: _api!),
                  )),
            icon: const Icon(Icons.location_on_outlined),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Hủy'),
          ),
          FilledButton(
            onPressed: () => _savePairingCode(pairingCode),
            child: const Text('Kết nối'),
          ),
        ],
      ),
    );
  }

  Future<void> _openEditor({CalendarEvent? event}) async {
    final result = await showModalBottomSheet<_EditorResult>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _EventEditor(day: _selectedDay, event: event),
    );
    if (result == null) return;
    setState(() => _busy = true);
    try {
      final at = DateTime.utc(
        result.day.year,
        result.day.month,
        result.day.day,
        result.time.hour,
        result.time.minute,
      ).subtract(const Duration(hours: 7)).millisecondsSinceEpoch;
      if (event == null) {
        await _api!.createEvent(result.title, at);
      } else {
        await _api!.updateEvent(
          CalendarEvent(
            id: event.id,
            title: result.title,
            at: at,
            done: event.done,
          ),
        );
      }
      await _refresh();
      if (mounted) {
        _showMessage(
          event == null
              ? 'Đã thêm hoạt động vào lịch.'
              : 'Đã cập nhật hoạt động.',
        );
      }
    } catch (error) {
      if (mounted) {
        _showMessage(error.toString().replaceFirst('HttpException: ', ''));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _toggleEvent(CalendarEvent event, bool done) async {
    setState(() => _busy = true);
    try {
      await _api!.updateEvent(
        CalendarEvent(
          id: event.id,
          title: event.title,
          at: event.at,
          done: done,
        ),
      );
      await _refresh();
    } catch (error) {
      if (mounted) {
        _showMessage(error.toString().replaceFirst('HttpException: ', ''));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _deleteEvent(CalendarEvent event) async {
    final remove = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Xóa hoạt động?'),
        content: Text('“${event.title}” sẽ bị xóa khỏi lịch.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Giữ lại'),
          ),
          FilledButton.tonal(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Xóa'),
          ),
        ],
      ),
    );
    if (remove != true) return;
    setState(() => _busy = true);
    try {
      await _api!.deleteEvent(event.id);
      await _refresh();
      if (mounted) _showMessage('Đã xóa hoạt động.');
    } catch (error) {
      if (mounted) {
        _showMessage(error.toString().replaceFirst('HttpException: ', ''));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
      );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _refreshTimer?.cancel();
    _api?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final selectedEvents = _selectedEvents;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Lịch của bạn',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
            ),
            Text(
              'GƯƠNG THÔNG MINH',
              style: TextStyle(fontSize: 10, letterSpacing: 1.8, color: _muted),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Làm mới',
            onPressed: _loading ? null : _refresh,
            icon: const Icon(Icons.refresh_rounded),
          ),
          IconButton(
            tooltip: 'Cài đặt kết nối',
            onPressed: _openSettings,
            icon: const Icon(Icons.settings_outlined),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Stack(
        children: [
          RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 36),
              children: [
                _connectionBanner(),
                const SizedBox(height: 12),
                _deviceStatus(),
                const SizedBox(height: 14),
                _monthCalendar(),
                const SizedBox(height: 20),
                _dayAgenda(selectedEvents),
              ],
            ),
          ),
          if (_busy)
            const Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: LinearProgressIndicator(minHeight: 2),
            ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _busy ? null : () => _openEditor(),
        backgroundColor: _teal,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Hoạt động'),
      ),
    );
  }

  Widget _connectionBanner() {
    final connected = _error == null && !_loading;
    final color = connected ? _teal : const Color(0xFFB55C37);
    final text = _loading
        ? 'Đang tải lịch…'
        : connected
            ? 'Lịch đã được cập nhật'
            : 'Chưa tải được lịch';
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Icon(
              connected ? Icons.cloud_done_outlined : Icons.cloud_off_outlined,
              color: color,
              size: 21,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                text,
                style: TextStyle(color: color, fontWeight: FontWeight.w600),
              ),
            ),
            if (_error != null)
              TextButton(onPressed: _refresh, child: const Text('Thử lại')),
          ],
        ),
      ),
    );
  }

  Widget _deviceStatus() {
    final online = _error == null && _mirror.online;
    final title = _error != null ? 'Chưa cập nhật được trạng thái gương' : !online
        ? 'Gương chưa kết nối'
        : _mirror.active
            ? 'Gương đang hoạt động'
            : 'Gương đang chờ';
    final color = online ? _teal : const Color(0xFF9A6A35);
    final lamp = !online
        ? '—'
        : _mirror.lamp == 'ON'
        ? 'Đang sáng'
        : _mirror.lamp == 'OFF'
            ? 'Đang tắt'
            : 'Chưa có dữ liệu';
    final brightness = !online || _mirror.screenBrightness == null
        ? '—'
        : _mirror.screenBrightness == 0 ? 'Đang tắt'
        : '${(_mirror.screenBrightness! * 100 / 255).round()}%';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(online ? Icons.devices_rounded : Icons.devices_outlined, color: color),
              const SizedBox(width: 10),
              Expanded(child: Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: color))),
              if (online) const Icon(Icons.circle, size: 9, color: Color(0xFF3B9A70)),
            ]),
            const SizedBox(height: 13),
            Row(children: [
              Expanded(child: _statusValue('Đèn soi · tự động', lamp, Icons.light_mode_outlined)),
              const SizedBox(width: 8),
              Expanded(child: _statusValue('Màn hình · tự chỉnh', brightness, Icons.wb_sunny_outlined)),
            ]),
            if (online) ...[
              const Divider(height: 22),
              Row(children: [
                Expanded(child: _statusValue('Nhiệt độ', _mirror.temperature == null ? '—' : '${_mirror.temperature!.toStringAsFixed(1)} °C', Icons.thermostat_outlined)),
                const SizedBox(width: 8),
                Expanded(child: _statusValue('Độ ẩm', _mirror.humidity == null ? '—' : '${_mirror.humidity!.toStringAsFixed(0)}%', Icons.water_drop_outlined)),
              ]),
            ],
            if (online)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(
                  _mirror.lightSensor == 'FALLBACK'
                      ? 'Kiểm tra cảm biến ánh sáng. Khi gương thức, màn hình dùng độ sáng dự phòng và đèn soi tắt.'
                      : 'Màn hình bật khi bạn đến gần và tự chỉnh độ sáng. Đèn soi chỉ sáng khi gương thức và phòng tối.',
                  style: TextStyle(color: _mirror.lightSensor == 'FALLBACK' ? const Color(0xFF9A6A35) : _muted, fontSize: 12),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _statusValue(String label, String value, IconData icon) {
    return Row(children: [
      Icon(icon, size: 18, color: _muted),
      const SizedBox(width: 7),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: _muted, fontSize: 11)),
        const SizedBox(height: 2),
        Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
      ])),
    ]);
  }

  Widget _monthCalendar() {
    final days = _calendarDays;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 15, 14, 13),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${_months[_visibleMonth.month - 1]} ${_visibleMonth.year}',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF20322D),
                    ),
                  ),
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  tooltip: 'Tháng trước',
                  onPressed: () => _changeMonth(-1),
                  icon: const Icon(Icons.chevron_left_rounded),
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  tooltip: 'Tháng sau',
                  onPressed: () => _changeMonth(1),
                  icon: const Icon(Icons.chevron_right_rounded),
                ),
                TextButton(onPressed: _goToday, child: const Text('Hôm nay')),
              ],
            ),
            const SizedBox(height: 7),
            Row(
              children: _weekdayLabels
                  .map(
                    (day) => Expanded(
                      child: Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 7),
                          child: Text(
                            day,
                            style: const TextStyle(
                              color: _muted,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: days.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 7,
                mainAxisSpacing: 2,
                crossAxisSpacing: 2,
                childAspectRatio: 0.88,
              ),
              itemBuilder: (context, index) {
                final day = days[index];
                final selected =
                    day.year == _selectedDay.year &&
                    day.month == _selectedDay.month &&
                    day.day == _selectedDay.day;
                final today =
                    day.year == _today.year &&
                    day.month == _today.month &&
                    day.day == _today.day;
                final count = _eventCount(day);
                final inMonth = day.month == _visibleMonth.month;
                return Semantics(
                  button: true,
                  label: '${_dateLabel(day)}, $count hoạt động',
                  selected: selected,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(15),
                    onTap: () => setState(() => _selectedDay = day),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 140),
                          width: 36,
                          height: 36,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: selected ? _teal : Colors.transparent,
                            shape: BoxShape.circle,
                            border: today && !selected
                                ? Border.all(color: _teal, width: 1.5)
                                : null,
                          ),
                          child: Text(
                            '${day.day}',
                            style: TextStyle(
                              color: selected
                                  ? Colors.white
                                  : inMonth
                                  ? const Color(0xFF243630)
                                  : const Color(0xFFB2BCB8),
                              fontWeight: selected || today
                                  ? FontWeight.w700
                                  : FontWeight.w500,
                            ),
                          ),
                        ),
                        const SizedBox(height: 3),
                        SizedBox(
                          height: 5,
                          child: count == 0
                              ? null
                              : Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: List.generate(
                                    count > 3 ? 3 : count,
                                    (_) => Container(
                                      width: 4,
                                      height: 4,
                                      margin: const EdgeInsets.symmetric(
                                        horizontal: 1,
                                      ),
                                      decoration: BoxDecoration(
                                        color: selected
                                            ? const Color(0xFF9EE1D1)
                                            : _teal,
                                        shape: BoxShape.circle,
                                      ),
                                    ),
                                  ),
                                ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 7),
            const Divider(height: 1, color: Color(0xFFEAF0ED)),
            Padding(
              padding: const EdgeInsets.only(top: 11),
              child: Row(
                children: [
                  const Icon(Icons.circle, size: 7, color: _teal),
                  const SizedBox(width: 7),
                  const Text(
                    'Ngày có hoạt động',
                    style: TextStyle(fontSize: 12, color: _muted),
                  ),
                  const Spacer(),
                  Text(
                    'Chọn ngày để xem lịch',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _dayAgenda(List<CalendarEvent> events) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 2, 4, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'LỊCH TRONG NGÀY',
                      style: TextStyle(
                        color: _teal,
                        letterSpacing: 1.4,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _dateLabel(_selectedDay),
                      style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF20322D),
                      ),
                    ),
                  ],
                ),
              ),
              OutlinedButton.icon(
                onPressed: _busy ? null : () => _openEditor(),
                icon: const Icon(Icons.add_rounded, size: 18),
                label: const Text('Thêm'),
              ),
            ],
          ),
        ),
        if (_loading)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(28),
              child: Center(child: CircularProgressIndicator()),
            ),
          )
        else if (_error != null && _events.isEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  const Icon(Icons.wifi_off_rounded, color: _muted, size: 34),
                  const SizedBox(height: 10),
                  Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: _muted),
                  ),
                  const SizedBox(height: 4),
                  TextButton(
                    onPressed: _openSettings,
                    child: const Text('Kiểm tra kết nối'),
                  ),
                ],
              ),
            ),
          )
        else if (events.isEmpty)
          Card(
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: _busy ? null : () => _openEditor(),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 22,
                  vertical: 25,
                ),
                child: Row(
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      decoration: const BoxDecoration(
                        color: Color(0xFFE9F5F1),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.event_available_outlined,
                        color: _teal,
                      ),
                    ),
                    const SizedBox(width: 14),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Ngày này đang trống',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                            ),
                          ),
                          SizedBox(height: 4),
                          Text(
                            'Chạm để thêm hoạt động vào lịch.',
                            style: TextStyle(color: _muted, fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded, color: _muted),
                  ],
                ),
              ),
            ),
          )
        else
          ...events.map(_eventTile),
        if (_error != null && _events.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Đang hiển thị dữ liệu đã tải trước đó. $_error',
              style: const TextStyle(color: Color(0xFF9E542F), fontSize: 12),
            ),
          ),
      ],
    );
  }

  Widget _eventTile(CalendarEvent event) {
    final date = _vietnamDate(event.at);
    final time =
        '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
    return Card(
      margin: const EdgeInsets.only(bottom: 9),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 8, 5, 8),
        child: Row(
          children: [
            Checkbox(
              value: event.done,
              activeColor: _teal,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(5),
              ),
              onChanged: _busy
                  ? null
                  : (value) => _toggleEvent(event, value ?? false),
            ),
            SizedBox(
              width: 52,
              child: Text(
                time,
                style: const TextStyle(
                  color: _teal,
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
            ),
            Expanded(
              child: Text(
                event.title,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  color: event.done ? _muted : const Color(0xFF23332E),
                  decoration: event.done ? TextDecoration.lineThrough : null,
                ),
              ),
            ),
            PopupMenuButton<String>(
              tooltip: 'Tùy chọn hoạt động',
              onSelected: (value) {
                if (value == 'edit') _openEditor(event: event);
                if (value == 'delete') _deleteEvent(event);
              },
              itemBuilder: (_) => const [
                PopupMenuItem(
                  value: 'edit',
                  child: ListTile(
                    leading: Icon(Icons.edit_outlined),
                    title: Text('Sửa'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
                PopupMenuItem(
                  value: 'delete',
                  child: ListTile(
                    leading: Icon(Icons.delete_outline),
                    title: Text('Xóa'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _EditorResult {
  const _EditorResult(this.title, this.day, this.time);
  final String title;
  final DateTime day;
  final TimeOfDay time;
}

class _EventEditor extends StatefulWidget {
  const _EventEditor({required this.day, this.event});

  final DateTime day;
  final CalendarEvent? event;

  @override
  State<_EventEditor> createState() => _EventEditorState();
}

class _EventEditorState extends State<_EventEditor> {
  late final TextEditingController _title;
  late DateTime _day;
  late TimeOfDay _time;

  @override
  void initState() {
    super.initState();
    final eventDate = widget.event == null
        ? null
        : _vietnamDate(widget.event!.at);
    _day = eventDate == null
        ? widget.day
        : DateTime.utc(eventDate.year, eventDate.month, eventDate.day);
    _time = eventDate == null
        ? const TimeOfDay(hour: 9, minute: 0)
        : TimeOfDay(hour: eventDate.hour, minute: eventDate.minute);
    _title = TextEditingController(text: widget.event?.title ?? '');
  }

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  Future<void> _chooseDay() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _day,
      firstDate: DateTime.utc(2020),
      lastDate: DateTime.utc(2100),
      helpText: 'Chọn ngày hoạt động',
      cancelText: 'Hủy',
      confirmText: 'Chọn',
    );
    if (date != null) {
      setState(() => _day = DateTime.utc(date.year, date.month, date.day));
    }
  }

  Future<void> _chooseTime() async {
    final time = await showTimePicker(
      context: context,
      initialTime: _time,
      helpText: 'Chọn giờ hoạt động',
      cancelText: 'Hủy',
      confirmText: 'Chọn',
    );
    if (time != null) setState(() => _time = time);
  }

  void _save() {
    final title = _title.text.trim();
    if (title.isEmpty) return;
    Navigator.pop(context, _EditorResult(title, _day, _time));
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: Material(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(26)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 38,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFFD6DEDA),
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Text(
                widget.event == null ? 'Thêm hoạt động' : 'Sửa hoạt động',
                style: const TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 18),
              TextField(
                controller: _title,
                autofocus: true,
                maxLength: 120,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Tên hoạt động',
                  hintText: 'Ví dụ: Họp nhóm, tập thể dục',
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _chooseDay,
                      icon: const Icon(Icons.calendar_today_outlined),
                      label: Text(_dateLabel(_day)),
                    ),
                  ),
                  const SizedBox(width: 10),
                  OutlinedButton.icon(
                    onPressed: _chooseTime,
                    icon: const Icon(Icons.schedule_rounded),
                    label: Text(_time.format(context)),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _save,
                  icon: const Icon(Icons.check_rounded),
                  label: Text(
                    widget.event == null ? 'Lưu vào lịch' : 'Lưu thay đổi',
                  ),
                  style: FilledButton.styleFrom(
                    backgroundColor: _teal,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 15),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
