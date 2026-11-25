# SmartMirror local backend

Phần backend Node-RED lưu lịch/vị trí, nhận trạng thái ESP32 và chuyển lịch trong ngày về màn TFT.
App Flutter chạy trên điện thoại và gửi lịch qua laptop bằng ADB reverse trên cáp USB.

## Chạy mô phỏng

Từ thư mục project chạy:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-dashboard.ps1 -ReloadFlow
```

Backend chỉ lắng nghe trên `127.0.0.1:1881`, dùng HTTPS và một mã ghép nối in ở terminal. Wokwi giao tiếp với Node-RED qua MQTT/TLS cổng 8883; Node-RED xác minh chứng chỉ broker. ESP32 cũng dùng TLS và CA khi cấu hình MQTT. Luồng điện thoại→HTTPS→Node-RED→USB/COM→ESP32 không dùng MQTT. Broker EMQX công cộng chỉ phù hợp mô phỏng vì các topic dùng chung; không gửi thông tin riêng tư qua đó. Bản triển khai nên dùng broker riêng có TLS, tài khoản và ACL.

Để cài và chạy MQTT riêng trên laptop cho ESP32 qua Wi‑Fi, chạy `scripts/install-private-mqtt.ps1`, rồi `node scripts/setup-private-mqtt.cjs <IPv4-laptop>`, sau đó `scripts/start-dashboard.ps1 -PrivateMqtt -ReloadFlow`. Broker đòi tài khoản, chỉ cho truy cập topic `smartmirror/demo01/#`, và dùng CA local để xác minh TLS. Mở firewall TCP 8883 chỉ cho `LocalSubnet` bằng script quản trị một lần. Không mở cổng này ra Internet.

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
