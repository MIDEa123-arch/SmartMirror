# Ứng dụng lịch cho gương thông minh

Ứng dụng Android viết bằng Flutter. Điện thoại kết nối laptop qua USB đã được ủy quyền. Laptop lưu lịch và chuyển nội dung trong ngày tới ESP32 bằng cáp USB/COM; app không kết nối ESP32 trực tiếp.

## Chạy trên emulator

1. Từ thư mục gốc dự án, chạy `scripts/start-dashboard.ps1 -ReloadFlow` và để cửa sổ chạy.
2. Android Emulator đã cắm sẵn qua ADB reverse do script cấu hình.
3. Trong `mobile_app`, chạy `flutter run -d emulator-5554`.
4. Trong app mở Cài đặt kết nối và nhập mã đang hiện trên cửa sổ PowerShell.

## Chạy trên điện thoại Android thật

1. Bật Tùy chọn nhà phát triển → Gỡ lỗi USB và chấp nhận yêu cầu tin cậy laptop.
2. Cắm cáp USB dữ liệu; chạy script project. Script cấu hình ADB reverse tự động cho thiết bị được ủy quyền.
3. Tại thư mục `mobile_app`, chạy `flutter run -d <device-id>` để cài/build app cho chứng chỉ HTTPS vừa tạo; hoặc `flutter build apk --debug` rồi cài APK.
4. Mở app, nhập mã kết nối đang hiện trên laptop.

Không cần chung Wi-Fi hoặc Internet cho lịch/app/ESP32. Android yêu cầu bật Gỡ lỗi USB và xác nhận laptop; chỉ tin cậy máy tính của bạn.

## ESP32 qua COM

Xem cổng trong Device Manager, sau đó chạy project với `scripts/start-dashboard.ps1 -SerialPort COM5 -ReloadFlow` (thay `COM5`). Node-RED dùng 115200 baud, 8-N-1. Dừng Node-RED trước khi upload firmware vì chỉ một tiến trình có thể giữ cổng.

## Bảo mật và giới hạn kiểm thử

Kết nối app dùng HTTPS cục bộ, mã ngẫu nhiên riêng của project và mã được lưu bằng Android Keystore. Chứng chỉ CA cục bộ được đóng gói trong app. Không có dịch vụ cloud. Chưa xác nhận cáp/COM trên phần cứng thật vì project hiện chưa có điện thoại và ESP32 thật.

```powershell
flutter analyze
flutter test
flutter build apk --debug
```
