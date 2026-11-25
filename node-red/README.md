# SmartMirror local backend

Phần backend Node-RED lưu lịch/vị trí, nhận trạng thái ESP32 và chuyển lịch trong ngày về màn TFT.
App Flutter chạy trên điện thoại và gửi lịch qua laptop bằng ADB reverse trên cáp USB.

## Chạy mô phỏng

Từ thư mục project chạy:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-dashboard.ps1 -ReloadFlow
```

Backend chỉ lắng nghe trên `127.0.0.1:1881`, dùng HTTPS và một mã ghép nối in ở terminal. Wokwi tiếp tục giao tiếp với Node-RED qua MQTT công cộng để mô phỏng.

## Chạy với điện thoại và ESP32

- Điện thoại: bật Gỡ lỗi USB, cắm vào laptop và xác nhận laptop tin cậy. Script sẽ chạy `adb reverse` cho thiết bị đã được ủy quyền.
- ESP32: nối USB dữ liệu tới laptop, tìm `COMx` trong Device Manager rồi chạy `scripts/start-dashboard.ps1 -SerialPort COMx -ReloadFlow`.
- Nối app → laptop → ESP32. Cổng nối ESP32 dùng 115200 baud, 8-N-1, newline. Tắt Node-RED trước khi nạp firmware để nhả cổng COM.
- Không bật LAN; app dùng HTTPS localhost, chứng chỉ riêng và mã kết nối. Không chuyển dịch vụ ra Internet.

## Source và kiểm tra

- `state.js`: trạng thái, lịch lưu bền, và tạo payload TFT.
- `mobile-api.js`: CRUD lịch với xác thực/kiểm tra đầu vào.
- `settings.cjs`: HTTPS loopback, mã Bearer, giới hạn tần suất.
- `scripts/build-dashboard.cjs`: tạo `flows.json`, thêm nhánh serial khi có `SMARTMIRROR_SERIAL_PORT`.

Kiểm tra đầy đủ và giới hạn phần cứng xem [README project](../README.md).
