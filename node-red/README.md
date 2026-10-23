# SmartMirror — ESP32 + Node-RED

Bản này hoàn thiện tới Node-RED Dashboard 2, dùng trên trình duyệt máy tính/điện thoại.
Không cần viết web hoặc app riêng. Thư mục `src/` vẫn là firmware ESP32.

## Chạy ngay trên Windows

Cần Node.js, Node-RED, PlatformIO và Wokwi như bản trước. Nếu chưa có Node-RED:

```powershell
npm.cmd install -g node-red
```

Tại thư mục dự án:

```powershell
Set-Location D:\IOT\SmartMirror
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-dashboard.ps1
```

Script dùng thư mục dữ liệu riêng `.runtime/`, cổng **1881**, lưu lịch/vị trí bằng file context.
Tận dụng Dashboard 2 đã cài ở `.node-red`, hoặc tự cài nếu chưa có.
Không thay settings hay flow đang chạy ở cổng 1880. Chỉ chạy một phiên script tại một thời điểm.
Runtime dùng bản sao `.runtime/flows.json`; chỉnh trong Editor sẽ lưu vào bản sao này,
không tự ghi đè source ở thư mục gốc. Muốn lưu sửa đổi Editor vào Git, export lại flow.

Mở:

- Gương: <http://localhost:1881/dashboard/guong>
- Điều khiển: <http://localhost:1881/dashboard/guong-thong-minh>
- Node-RED Editor: <http://localhost:1881>

Tiếp tục chạy firmware trong Wokwi. Khi không có ESP32, ô số đo hiện `--` và điều khiển khóa.
Trong Wokwi đặt HC-SR04 **40 cm** để gương ACTIVE; nút GPIO32 chuyển 3 trang.
Đưa HC-SR04 ra 300 cm, không nhấn nút trong 120 giây để SLEEP.
Ctrl+C tại Terminal để dừng Node-RED.

## Lấy vị trí thật và thời tiết — không cần API key

Có hai API thật: Open-Meteo Geocoding để tìm địa điểm và Forecast để lấy thời tiết.
Gói API công cộng này phù hợp dự án cá nhân, phi thương mại theo điều kiện của nhà cung cấp.

### Cách 1: Tìm địa điểm

1. Mở trang **Điều khiển**, kéo xuống **Vị trí thời tiết**.
2. Nhập `Đà Nẵng`, `Hà Nội`, hoặc tên nơi bạn cần; nhấn **Tìm địa điểm**.
3. API trả danh sách kết quả thật; chọn đúng thành phố/tỉnh/quốc gia.
4. Node-RED lưu tọa độ và tự lấy thời tiết hiện tại cùng dự báo 3 ngày.
5. Tự cập nhật mỗi 15 phút; nút Cập nhật cho phép gọi sớm hơn (giới hạn tối thiểu 10 giây).

### Cách 2: Định vị thiết bị

1. Mở Dashboard bằng `http://localhost:1881` trên máy tính chạy Node-RED.
2. Nhấn **Dùng vị trí của tôi**.
3. Khi trình duyệt hỏi, chọn **Cho phép / Allow**. Có thể phải bật Location của Windows.
4. Trình duyệt trả tọa độ (không nhất thiết từ GPS); độ chính xác phụ thuộc thiết bị.
5. Tọa độ được làm tròn, lưu tại máy Node-RED và gửi tới Open-Meteo khi lấy thời tiết.

Không tự định vị khi mở trang; chỉ thực hiện sau khi bạn nhấn nút.
Vị trí là cấu hình chung của gương, không phải vị trí độc lập của từng điện thoại.
Nút **Xóa vị trí đã lưu** xóa cấu hình vị trí và dữ liệu thời tiết tại Node-RED.

Trình duyệt chỉ cho định vị ở HTTPS hoặc localhost. Nếu truy cập bằng IP LAN qua HTTP,
hãy dùng tìm tên địa điểm. Không cần đăng ký tài khoản hoặc gửi API key cho người khác.

Tài liệu: [Geocoding API](https://open-meteo.com/en/docs/geocoding-api),
[Forecast API](https://open-meteo.com/en/docs),
[quyền định vị trình duyệt](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition).

## Giao diện và logic

- **Tổng quan:** giờ/ngày Việt Nam, nhiệt độ/độ ẩm trong phòng, trạng thái quạt và đèn.
- **Thời tiết:** số liệu ngoài trời theo vị trí chọn, dự báo 3 ngày và thời điểm cập nhật.
- **Lịch & nhắc việc:** thêm việc ở Điều khiển; nhắc từ 15 phút trước đến 1 phút sau giờ hẹn.
- Nút nhấn lần lượt chuyển Tổng quan → Thời tiết → Lịch → Tổng quan; giữ không lặp.
- Khi SLEEP, gương nền đen. Khi ACTIVE trở lại, quay về Tổng quan.
- Các trình duyệt cùng xem trạng thái và trang gương do Node-RED quản lý chung.
- Lịch nhập theo giờ Việt Nam UTC+7, kể cả khi múi giờ điện thoại khác.
- Lịch nhập trực tiếp; chưa kết nối Google Calendar. Nhắc trên giao diện, không gửi push khi trình duyệt đóng.
- Nhiệt độ/độ ẩm không có mẫu mới 15 giây sẽ hiện `--`; các lệnh bị khóa khi thiết bị chưa có dữ liệu mới.
- Thời tiết cũ quá 30 phút được gắn nhãn; lỗi API giữ bản cũ kèm thông báo.
- Điều khiển gửi QoS 1, không retain. UI đợi trạng thái ESP32 xác nhận tối đa 8 giây.
- Quạt AUTO bật ≥32°C, tắt ≤30°C; MANUAL mới dùng nút bật/tắt quạt.
- Đèn vẫn chỉnh thủ công 0–255 khi ACTIVE. Chưa có cảm biến ánh sáng để AUTO.
- Lịch sử: một mẫu hợp lệ/phút, tối đa 24 giờ trong phiên chạy; xuất CSV có nhiệt độ và độ ẩm.
- Lưu lịch/vị trí qua khởi động lại; lịch sử và trạng thái online không được khôi phục như dữ liệu mới.
  File context có thể cần tới 30 giây để flush; dừng bằng Ctrl+C để đóng sạch.

## Xem trên điện thoại cùng Wi-Fi

Dừng phiên đang chạy rồi bật chế độ LAN:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-dashboard.ps1 -Lan
ipconfig
```

Tìm IPv4 của Wi-Fi máy tính, ví dụ `192.168.1.10`. Trên điện thoại mở:
`http://192.168.1.10:1881/dashboard/guong-thong-minh`.
Nếu Windows Firewall hỏi, cho phép Node.js trên mạng Private. Máy và điện thoại phải cùng mạng.
Chế độ này cũng cho mạng LAN truy cập Editor; dùng mạng tin cậy, chưa mở cổng ra Internet.
Không cần HTTPS nếu chỉ tìm địa điểm và điều khiển qua LAN; định vị trên điện thoại cần HTTPS.

## Nếu muốn import vào Node-RED cũ ở cổng 1880

1. Export bản flow hiện tại để dự phòng.
2. Cài `@flowfuse/node-red-dashboard` (Dashboard 2).
3. Thay flow SmartMirror cũ bằng `flows.json`, không để hai flow cùng subscribe/phát lệnh trùng.
4. Deploy; thay 1881 bằng 1880 trong các đường dẫn trên.
5. Để lịch/vị trí lưu qua khởi động lại, hợp nhất mục sau vào `settings.js` rồi restart:

```javascript
contextStorage: {
    default: 'memoryOnly',
    memoryOnly: { module: 'memory' },
    file: { module: 'localfilesystem' }
},
```

Script chạy riêng đã có cấu hình này sẵn. Không chạy song song hai Node-RED dùng chung `flows.json`.

## Mạch và firmware

| Thiết bị | GPIO / kết nối |
| --- | --- |
| DHT22 | GPIO15, kéo lên 3V3 bằng 10kΩ |
| HC-SR04 | TRIG 13, ECHO 14 |
| Nút nhấn | GPIO32 ↔ nút ↔ GND, INPUT_PULLUP |
| LED đèn gương | GPIO26 qua 330Ω |
| LED mô phỏng quạt | GPIO27 qua 330Ω |

Giữ nguyên firmware QoS 1 đã build trước đó. Build khi cần:

```powershell
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" run
```

Mạch hiện là Wokwi. Khi làm thật cần xử lý mức điện áp ECHO của HC-SR04 phù hợp ESP32
và mạch công suất riêng cho quạt/đèn. MQTT hiện vẫn dùng broker public phục vụ demo.

## Sửa source và kiểm tra

- `node-red/dashboard.vue`: giao diện chung, được build thành hai widget gương/điều khiển.
- `node-red/state.js`: xử lý trạng thái, độ mới dữ liệu, lệnh, lịch, lịch sử và API.
- `scripts/build-dashboard.cjs`: đóng gói vào `flows.json` để import.
- `node-red/settings.cjs`: cấu hình runtime riêng.

```powershell
node scripts/build-dashboard.cjs
node scripts/test-page-events.cjs
node scripts/test-dashboard.cjs
```

Chạy build sau khi sửa source Vue/Function, dừng runtime rồi nạp bản mới bằng:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-dashboard.ps1 -ReloadFlow
```

`-ReloadFlow` thay bản flow runtime bằng bản gốc vừa build; export các sửa đổi Editor cần giữ trước.
Build ghi đè các node giao diện sinh tự động: nếu đã sửa chúng trực tiếp trong Editor,
hãy đưa thay đổi về source trước khi build. Script khởi động không tự build đè flow.

Kiểm tra tùy chọn, cần Node-RED riêng đang chạy ở 1881:

```powershell
npm.cmd install --prefix .runtime/qa playwright aedes@0.51.3 mqtt
node scripts/qa-dashboard.cjs
node scripts/test-dashboard-e2e.cjs
```

Bài end-to-end tạm thay broker ở runtime riêng bằng broker local 1884 rồi khôi phục;
không chạy khi đang chỉnh flow chưa lưu. Dùng Edge headless để chụp desktop/mobile.
Bài này kiểm tra MQTT QoS 1, xác nhận lệnh, chống trùng, ngủ/thức, API thật và nhắc việc;
không phát lệnh thử lên broker public, không thay thế kiểm tra thao tác vật lý/Wokwi.
