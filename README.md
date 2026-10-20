# SmartMirror — Hướng dẫn chạy trên Windows

Source mô phỏng gương thông minh bằng **ESP32 + Wokwi + MQTT + Node-RED**. Hướng dẫn này dành cho người nhận source và muốn cài đặt, chạy, demo trên Windows 10/11. Không cần ESP32 thật để chạy mô phỏng.

## 1. Dự án làm được gì?

| Thành phần | Chức năng |
| --- | --- |
| DHT22 | Đọc nhiệt độ và độ ẩm mỗi 2 giây |
| HC-SR04 | Đo khoảng cách để bật và giữ sáng đèn gương |
| PIR | Khi đèn sáng, phát hiện chuyển động để gửi sự kiện NEXT |
| LED trắng GPIO26 | Mô phỏng đèn gương, điều chỉnh độ sáng 0–255 |
| LED xanh GPIO27 | Mô phỏng quạt bật/tắt |
| MQTT | Truyền dữ liệu và lệnh giữa ESP32 với Node-RED |
| Node-RED Dashboard | Điều khiển chế độ quạt, công tắc quạt và độ sáng đèn |
| Node-RED Debug | Xem nhiệt độ, độ ẩm, chuyển động, NEXT và trạng thái thiết bị |

**Logic hiện tại:**

- Khoảng cách **25 ≤ d < 60 cm**: bật/giữ gương ACTIVE.
- Ra ngoài vùng trên: chờ **120 giây không có hoạt động** rồi SLEEP; không tắt ngay.
- Quạt AUTO: bật khi **≥ 32°C**, tắt khi **≤ 30°C**; giữa 30–32°C giữ trạng thái trước.
- Quạt MANUAL: dùng công tắc trên Dashboard.
- PIR không tự đánh thức gương. Khi gương ACTIVE và đèn có độ sáng lớn hơn 0, PIR HIGH cho phép gửi NEXT tối đa **một lần mỗi giây**, không cần chờ LOW. Nếu HIGH kéo dài, NEXT có thể lặp mỗi giây.
- PIR chỉ báo chuyển động, không đo khoảng cách và không phân biệt tay với người.

**Lưu ý về chuyển trang:** `flows.json` hiện nối sự kiện NEXT vào Debug. Bản source này chưa có màn hình nội dung để tự chuyển trang; demo PIR bằng cách quan sát message `NEXT`. Dashboard đi kèm có các nút điều khiển, còn số đo được xem trong Debug.

## 2. Các thành phần kết nối như thế nào?

```text
DHT22 / HC-SR04 / PIR
          ↓
   ESP32 trong Wokwi ───→ LED trắng / LED xanh
          ↕ WiFi + MQTT
    broker.emqx.io:1883
          ↕ MQTT
        Node-RED
          ↕
   Dashboard / Debug
```

- **VS Code:** mở và sửa code.
- **PlatformIO:** tải thư viện và biên dịch code thành firmware.
- **Wokwi:** chạy firmware để mô phỏng mạch.
- **Node.js:** môi trường chạy Node-RED.
- **Node-RED:** nhận/gửi MQTT và cung cấp Dashboard trên trình duyệt.

ESP32 mô phỏng và Node-RED cùng dùng broker public, nên máy cần Internet. Không cần cài broker MQTT local hoặc MQTT extension trong VS Code cho cách chạy này.

## 3. Link tải phần mềm và extension

| Cần cài | Link chính thức |
| --- | --- |
| Visual Studio Code cho Windows | [Tải VS Code](https://code.visualstudio.com/download) |
| PlatformIO IDE, nhà phát hành PlatformIO | [Extension PlatformIO](https://marketplace.visualstudio.com/items?itemName=platformio.platformio-ide) |
| C/C++, nhà phát hành Microsoft | [Extension C/C++](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cpptools) |
| Wokwi Simulator, nhà phát hành Wokwi | [Extension Wokwi](https://marketplace.visualstudio.com/items?itemName=wokwi.wokwi-vscode) |
| Node.js LTS | [Tải Node.js](https://nodejs.org/en/download) |
| Node-RED | [Hướng dẫn cài Windows](https://nodered.org/docs/getting-started/windows) |
| FlowFuse Dashboard 2 | [Hướng dẫn cài Dashboard](https://dashboard.flowfuse.com/getting-started.html) |

Chọn **Node.js 24.x LTS**, phiên bản Node-RED khuyến nghị tại thời điểm soạn hướng dẫn. Chọn Windows Installer `.msi`, đúng kiến trúc máy (thường là x64). [Các phiên bản Node.js được hỗ trợ](https://nodered.org/docs/faq/node-versions).

Wokwi trên VS Code cần license và có thời gian dùng thử theo chính sách Wokwi. Xem [hướng dẫn bắt đầu](https://docs.wokwi.com/vscode/getting-started) và [trang license](https://wokwi.com/license).

## 4. Tải source và mở đúng thư mục

Có thể tải ở [repository SmartMirror](https://github.com/MIDEa123-arch/SmartMirror): **Code → Download ZIP**, rồi giải nén. Nếu đã được gửi source thì chỉ cần giải nén thư mục đó.

Ví dụ đặt tại:

```text
D:\IOT\SmartMirror
```

Mở VS Code → **File → Open Folder**, chọn thư mục chứa `platformio.ini`.

Các file chính:

```text
SmartMirror/
├── src/
│   └── main.cpp        ← chương trình ESP32
├── platformio.ini     ← board, framework và thư viện
├── diagram.json       ← sơ đồ mạch Wokwi
├── wokwi.toml         ← đường dẫn firmware cho Wokwi
├── flows.json         ← flow Node-RED cần import
└── README.md          ← toàn bộ hướng dẫn
```

Không chỉ mở riêng `main.cpp`. Không cần tạo New Project vì source đã là dự án PlatformIO.

Nếu chuyển thư mục từ Linux sang Windows, không mang theo `.pio`, `compile_commands.json`, hoặc các file `.vscode/c_cpp_properties.json`, `.vscode/launch.json` sinh từ máy cũ. Chúng có thể chứa đường dẫn Linux. PlatformIO sẽ tạo lại cho Windows.

## 5. Cài VS Code, PlatformIO và Wokwi

1. Cài VS Code từ link mục 3.
2. Mở VS Code, nhấn **Ctrl + Shift + X** để mở Extensions.
3. Cài **PlatformIO IDE**. Đợi thiết lập xong; Reload/Restart nếu được yêu cầu.
4. Cài **C/C++ của Microsoft** nếu chưa có.
5. Cài **Wokwi Simulator**.
6. Nhấn **Ctrl + Shift + P → Wokwi: Request a New License**, làm theo trình duyệt để kích hoạt license/trial.
7. Mở lại thư mục SmartMirror nếu cần.

PlatformIO IDE đã kèm `pio`, không cần cài riêng bằng pip. [Tài liệu PlatformIO IDE](https://docs.platformio.org/en/latest/integration/ide/vscode.html).

## 6. Build code ESP32

`platformio.ini` đi kèm có cấu hình:

```ini
[env:esp32dev]
platform = espressif32 @ 6.12.0
board = esp32dev
framework = arduino
monitor_speed = 115200

lib_deps =
    beegee-tokyo/DHT sensor library for ESPx @ 1.19.0
    knolleary/PubSubClient
    bblanchon/ArduinoJson
```

Giữ phiên bản platform đã cố định để chạy theo cấu hình dự án. `WiFi.h` đi kèm framework ESP32, DHTesp và PubSubClient được PlatformIO tải từ `lib_deps`. ArduinoJson hiện có trong dependency nhưng code chưa sử dụng để xử lý dữ liệu.

**Cách build bằng giao diện:**

1. Nhấn **Ctrl + Shift + P**.
2. Chọn **PlatformIO: Build**, hoặc nút dấu tick Build của PlatformIO.
3. Đợi tải thư viện/công cụ và biên dịch. Lần đầu có thể mất vài phút.
4. Cuối Terminal phải có **SUCCESS**.

Hoặc mở **PlatformIO Terminal**, đứng tại thư mục chứa `platformio.ini` rồi chạy:

```powershell
pio run
```

Nếu Terminal Windows báo không nhận `pio`, dùng nút Build hoặc PowerShell với đường dẫn mặc định:

```powershell
Set-Location 'D:\IOT\SmartMirror'
& "$env:USERPROFILE\.platformio\penv\Scripts\platformio.exe" run
```

Nếu PlatformIO cài ở vị trí riêng, dùng Terminal của PlatformIO. Không dùng `fish_add_path` trên Windows.

Build thành công sẽ tạo:

```text
.pio/build/esp32dev/firmware.bin
.pio/build/esp32dev/firmware.elf
```

## 7. Cài Node.js và Node-RED

### 7.1. Cài Node.js

1. Tải Node.js LTS `.msi` từ link mục 3.
2. Chạy bộ cài, giữ npm và tùy chọn thêm PATH.
3. Đóng Terminal cũ, mở **Command Prompt (CMD)** mới từ Start Menu.
4. Kiểm tra:

```bat
node --version
npm.cmd --version
```

Cả hai phải hiện phiên bản. Dùng CMD ở các bước này để tránh lỗi PowerShell chặn `npm.ps1`.

### 7.2. Cài và chạy Node-RED

Trong CMD:

```bat
npm.cmd install -g node-red
```

Đợi cài xong, chạy:

```bat
node-red.cmd
```

Giữ cửa sổ này mở, sau đó mở trình duyệt tại:

```text
http://localhost:1880
```

Đây là **Node-RED Editor**, nơi import và nối flow. Node-RED là chương trình riêng, không phải extension VS Code. Nhấn **Ctrl + C** trong CMD để dừng server. [Hướng dẫn cài Node-RED local](https://nodered.org/docs/getting-started/local).

### 7.3. Cài FlowFuse Dashboard 2

Trong Editor:

1. Bấm menu **☰** góc trên phải → **Manage palette**.
2. Chọn tab **Install**.
3. Tìm đúng gói **`@flowfuse/node-red-dashboard`**.
4. Bấm Install và đợi cài xong.
5. Reload Editor hoặc restart Node-RED nếu được yêu cầu.

Không chọn gói cũ `node-red-dashboard`. Flow này dùng Dashboard 2, node dạng `ui-switch`, `ui-slider`, `ui-dropdown`. [Tài liệu FlowFuse Dashboard](https://dashboard.flowfuse.com/getting-started.html).

Nếu cài bằng CMD: chạy Node-RED ít nhất một lần để tạo thư mục người dùng, dừng bằng Ctrl+C rồi chạy:

```bat
cd /d "%USERPROFILE%\.node-red"
npm.cmd install @flowfuse/node-red-dashboard
node-red.cmd
```

Flow được export với Dashboard 2 phiên bản 1.33.0. Nếu cần khớp bản export, dùng `npm.cmd install @flowfuse/node-red-dashboard@1.33.0` thay lệnh cài không ghi phiên bản.

Chạy local theo hướng dẫn này không cần tài khoản FlowFuse Cloud. MQTT-in, MQTT-out, Debug và Function đã có sẵn trong Node-RED, không cần cài thêm node cho chúng.

## 8. Import flows.json

1. Mở `http://localhost:1880`.
2. Nhấn **Ctrl + I**, hoặc menu **☰ → Import**.
3. Chọn **select a file to import**.
4. Chọn `D:\IOT\SmartMirror\flows.json`.
5. Chọn flow mới nếu hộp thoại cho chọn; bấm **Import** và đặt node lên canvas nếu cần.
6. Tab đi kèm hiện có tên **Flow 1**.
7. Kiểm tra không có node unknown/missing. Nếu thiếu `ui-*`, cài đúng Dashboard 2 ở mục 7.3.
8. Bấm **Deploy** góc trên phải.

Chỉ import một lần. Nếu đã có flow cũ giống nhau, Disable tab trùng và Deploy, tránh nhiều flow cùng gửi lệnh. Node-RED cho import file hoặc dán JSON. [Hướng dẫn import/export](https://nodered.org/docs/user-guide/editor/workspace/import-export).

### 8.1. Kiểm tra broker

Double-click một MQTT-in → bấm bút chì cạnh Server. Cấu hình phải giống ESP32:

```text
Server: broker.emqx.io
Port: 1883
TLS: tắt
Username / Password: để trống
Client ID của Node-RED: để trống để tự tạo
```

MQTT node phải báo connected khi máy kết nối được broker. Không cấu hình `localhost` làm broker vì source đang dùng broker public.

Tiền tố topic là `smartmirror/demo01/`. Nếu nhiều nhóm cùng chạy, đổi toàn bộ tiền tố này thành tên riêng, ví dụ `smartmirror/nhom07/`, trong **cả `src/main.cpp` và `flows.json`**. Sau đó build ESP32, import flow đã đổi và Deploy. Không gửi dữ liệu nhạy cảm lên broker demo public.

### 8.2. Mở Dashboard điều khiển

```text
http://localhost:1880/dashboard/guong-thong-minh
```

Dashboard có dropdown chế độ quạt, công tắc quạt và slider độ sáng. Đây khác Editor ở `localhost:1880`. Không dùng đường dẫn `/ui` của Dashboard cũ.

### 8.3. Xem dữ liệu trong Debug

Quay lại Editor → mở sidebar **Debug** bên phải, biểu tượng con bọ. Kiểm tra nút bật/tắt nhỏ cạnh phải các Debug node đang bật.

| Debug | Nội dung |
| --- | --- |
| debug 1 | Nhiệt độ |
| debug 2 | Độ ẩm |
| debug 3 | Chuyển động PIR |
| debug 4 | Sự kiện NEXT |
| debug 5 | Trạng thái quạt |
| debug 6 | ACTIVE/SLEEP |
| debug 7 | online/offline |
| debug 8 | Lệnh AUTO/MANUAL từ giao diện |
| debug 9 | Lệnh ON/OFF quạt từ giao diện |
| debug 10 | Lệnh độ sáng từ giao diện |

Muốn thấy cả topic và payload: double-click Debug → Output **complete msg object** → Done → Deploy. Nhìn dây nối từ MQTT-in để xác định đúng Debug.

Debug 8–10 chỉ xác nhận lệnh giao diện gửi đi, chưa chứng minh thiết bị đã thực hiện. Đối chiếu LED mô phỏng, Serial và Debug trạng thái quạt.

## 9. Chạy Wokwi

File `wokwi.toml` đi kèm:

```toml
[wokwi]
version = 1
firmware = ".pio/build/esp32dev/firmware.bin"
elf = ".pio/build/esp32dev/firmware.elf"
```

1. Đảm bảo đã **Build SUCCESS** và Node-RED đã Deploy.
2. VS Code → **Ctrl + Shift + P → Wokwi: Start Simulator**.
3. Nếu chọn sai cấu hình, dùng **Wokwi: Select Config File**, chọn `wokwi.toml` của SmartMirror.
4. Xem Serial Monitor trong khung Wokwi; không cần chọn cổng COM vật lý.
5. Đợi log `ESP32 da khoi dong`, `MQTT da ket noi` và nhiệt độ/độ ẩm.
6. Mở Dashboard và Editor để demo.

WiFi trong code là `Wokwi-GUEST`, mật khẩu trống, dành cho mô phỏng. Các dòng `ets Jul 29 2019`, `load:...`, `entry...` là log boot, không phải ngày hiện tại và không phải lỗi nếu chương trình sau đó chạy bình thường.

Wokwi chạy firmware đã biên dịch, không chạy trực tiếp `main.cpp`. [Tài liệu cấu hình Wokwi](https://docs.wokwi.com/vscode/project-config).

## 10. Demo từng chức năng

### 10.1. Đọc nhiệt độ và độ ẩm

1. Bấm DHT22 trong mô phỏng.
2. Đổi Temperature thành **28°C**, Humidity thành **65%**.
3. Đợi một chu kỳ đọc khoảng 2 giây.
4. Serial và Debug 1/2 phải có dữ liệu tương ứng.

DHT22 vẫn được đọc khi gương SLEEP. Payload là chuỗi số đơn giản, không phải JSON object.

### 10.2. Bật đèn theo khoảng cách

1. Bấm HC-SR04, chỉnh Distance thành **40 cm**.
2. Đợi một chu kỳ đo khoảng 250 ms.
3. Serial báo `Guong: ACTIVE`, LED trắng sáng theo độ sáng đang đặt.
4. Giữ 40 cm thì gương tiếp tục ACTIVE.

Ngưỡng chính xác là **25 ≤ d < 60 cm**. Dùng 40 cm để demo, tránh ngay sát biên. Thay khoảng cách không gửi NEXT.

### 10.3. PIR gửi NEXT

1. HC-SR04 = **40 cm** để gương ACTIVE.
2. Slider độ sáng đặt **180**, không để 0.
3. Đợi `MQTT da ket noi`.
4. Bấm PIR → **Simulate Motion**.
5. Serial báo `PIR: NEXT PAGE`; Debug 4 nhận payload **NEXT** ở topic `smartmirror/demo01/event/page`.
6. Kích hoạt lại cách nhau hơn 1 giây để xem các sự kiện mới.

PIR Wokwi hiện giữ tín hiệu 0,5 giây, có thời gian bỏ qua đầu vào 0,1 giây và tắt retrigger. Các lần bấm trong thời gian bị chặn có thể không tạo tín hiệu mới. Nếu tăng thời gian HIGH thì code có thể phát NEXT mỗi giây suốt thời gian HIGH. [Tài liệu PIR Wokwi](https://docs.wokwi.com/parts/wokwi-pir-motion-sensor).

Khi gương SLEEP hoặc đèn bằng 0, PIR không gửi NEXT. Flow hiện tại chỉ Debug NEXT; không có trang hiển thị nội dung tự đổi.

### 10.4. Quạt AUTO

1. Dashboard → chọn **AUTO**.
2. DHT22 = **28°C** → quạt tắt.
3. Tăng **33°C** → đợi DHT đọc, LED xanh sáng, trạng thái quạt ON.
4. Giảm **31°C** → quạt vẫn bật.
5. Giảm **29°C** → quạt tắt.

Hai ngưỡng 32/30°C tránh bật/tắt liên tục gần một nhiệt độ.

### 10.5. Quạt MANUAL

1. Dashboard → chọn **MANUAL** trước.
2. Bật công tắc quạt → LED xanh sáng.
3. Tắt công tắc → LED xanh tắt.
4. Chọn AUTO để quay về điều khiển theo nhiệt độ.

Trong AUTO, công tắc không trực tiếp ghi đè điều khiển tự động. LED xanh chỉ mô phỏng quạt, không phải motor thật.

### 10.6. Độ sáng đèn

1. HC-SR04 = 40 cm để gương ACTIVE.
2. Kéo slider **255** → sáng tối đa.
3. Kéo **80** → sáng yếu hơn.
4. Kéo **0** → đèn tắt; PIR không NEXT dù gương có thể vẫn ACTIVE.
5. Kéo lại **180** để tiếp tục demo.

Slider gửi số nguyên 0–255, Function trong flow chuyển thành chuỗi trước khi gửi MQTT. Source hiện không nhận `ON`/`OFF` cho lệnh độ sáng. Slider không tự đánh thức gương đang SLEEP.

### 10.7. SLEEP khi rời đi

1. HC-SR04 = **300 cm**.
2. Ngừng kích hoạt PIR, đợi `PIR: Het chuyen dong`.
3. Chờ **120 giây kể từ hoạt động cuối**.
4. Serial báo `Guong: SLEEP`, LED trắng tắt, Debug 6 nhận SLEEP.
5. Đổi khoảng cách về 40 cm → gương ACTIVE lại.

Nếu giữ khoảng cách trong 25–<60 cm, thời gian hoạt động được gia hạn nên không ngủ. NEXT hợp lệ cũng gia hạn. Quạt không tự tắt chỉ vì gương SLEEP.

Muốn demo nhanh, tạm đổi `SLEEP_TIMEOUT = 120000UL` thành `10000UL` trong `main.cpp`, build và chạy lại để chờ 10 giây; nói rõ đã rút ngắn và trả lại 120000 sau demo nếu muốn giữ mặc định.

## 11. Topic MQTT và cách đọc flow

Tiền tố mặc định: `smartmirror/demo01/`.

| Hướng | Phần sau tiền tố | Payload |
| --- | --- | --- |
| ESP32 → Node-RED | `sensor/temperature` | Ví dụ `28.0` |
| ESP32 → Node-RED | `sensor/humidity` | Ví dụ `65.0` |
| ESP32 → Node-RED | `sensor/motion` | `ON`, `OFF` |
| ESP32 → Node-RED | `event/page` | `NEXT` |
| ESP32 → Node-RED | `state/fan` | `ON`, `OFF` |
| ESP32 → Node-RED | `state/light` | PWM thực tế `0`–`255` |
| ESP32 → Node-RED | `state/active` | `ACTIVE`, `SLEEP` |
| ESP32 → Node-RED | `state/mode` | `AUTO`, `MANUAL` |
| ESP32 → Node-RED | `status` | `online`, `offline` |
| Node-RED → ESP32 | `cmd/mode` | `AUTO`, `MANUAL` |
| Node-RED → ESP32 | `cmd/fan` | `ON`, `OFF` |
| Node-RED → ESP32 | `cmd/light` | Chuỗi số `0`–`255` |

Ví dụ topic NEXT đầy đủ là `smartmirror/demo01/event/page`. `event/gesture` là topic cũ, không dùng.

Các nhánh flow:

- **MQTT-in → Debug:** nhận cảm biến, NEXT và trạng thái.
- **ui-dropdown → MQTT-out:** gửi AUTO/MANUAL.
- **ui-switch → MQTT-out:** gửi ON/OFF quạt.
- **ui-slider → Function → MQTT-out:** gửi độ sáng.
- **mqtt-broker SmartMirror:** server chung cho các MQTT node.
- **ui-base / ui-page / ui-group / ui-theme:** cấu hình Dashboard.

ESP32 publish trạng thái có thể dùng retained nên khi kết nối có thể nhìn thấy dữ liệu cũ trước số đo mới. MQTT Last Will có thể báo offline sau khi broker phát hiện mất kết nối, không nhất thiết ngay khi dừng Wokwi. Đối chiếu Serial và số đo đang cập nhật.

## 12. Những lần chạy sau

Không phải cài lại extension, Node-RED hoặc import flow mỗi lần:

1. Mở CMD → chạy `node-red.cmd`, giữ cửa sổ mở.
2. Mở VS Code tại SmartMirror.
3. Nếu sửa code hoặc thiếu firmware thì Build; chờ SUCCESS.
4. Chạy **Wokwi: Start Simulator**.
5. Mở `http://localhost:1880/dashboard/guong-thong-minh` để điều khiển.
6. Mở `http://localhost:1880` để xem Debug.

Sửa C++: **lưu → Build → dừng/chạy lại Wokwi**. Sửa `diagram.json`: chạy lại mô phỏng. Sửa flow trong Editor: **Deploy**. Sửa file `flows.json` bên ngoài không tự cập nhật Node-RED đang chạy; phải import bản sửa hoặc sửa trực tiếp trong Editor.

## 13. Lỗi thường gặp

| Lỗi / hiện tượng | Cách xử lý |
| --- | --- |
| Không nhận `pio` | Dùng PlatformIO Build hoặc Terminal PlatformIO; xem mục 6 |
| `npm.ps1 cannot be loaded` | Dùng CMD và `npm.cmd`, không cần đổi execution policy |
| Không nhận `node-red` | Mở Terminal mới; dùng `node-red.cmd`, hoặc `"%APPDATA%\npm\node-red.cmd"` trong CMD |
| Không mở được localhost:1880 | Kiểm tra cửa sổ chạy Node-RED còn mở; xem URL server trong log |
| Port 1880 bị chiếm | Dừng phiên Node-RED trùng; hoặc chạy `node-red.cmd -p 1881`, đổi URL sang 1881 |
| Missing node `ui-*` | Cài đúng `@flowfuse/node-red-dashboard`, restart nếu cần |
| Dashboard `/ui` không có | Dùng `/dashboard/guong-thong-minh` |
| Wokwi không thấy firmware.bin | Build SUCCESS trước, kiểm tra đúng thư mục và wokwi.toml |
| `undefined reference to setup/loop` | main.cpp phải có định nghĩa `void setup()` và `void loop()`, không chỉ include |
| Gạch đỏ nhưng build thành công | Bỏ cấu hình đường dẫn Linux khi chuyển máy; chạy PlatformIO: Rebuild C/C++ Project Index rồi Developer: Reload Window |
| Thiếu DHTesp.h | Dùng đúng DHT sensor library for ESPx; Adafruit DHT có header/API khác |
| DHT22 TIMEOUT/CHECKSUM | Kiểm tra GPIO15, nguồn/GND, firmware mới, giữ platform đã cố định và chu kỳ đọc 2 giây |
| MQTT không kết nối | Kiểm tra Internet, broker/port, Wokwi license, Serial và trạng thái connected của node MQTT |
| NEXT chỉ có trong Debug | Đúng với flow đi kèm; chưa có phần giao diện chuyển nội dung |
| PIR không gửi NEXT | Kiểm tra ACTIVE, độ sáng > 0, MQTT kết nối; thử lại sau hơn 1 giây |
| NEXT lặp mỗi giây | Đúng khi PIR giữ HIGH, kiểm tra delayTime của PIR |
| Công tắc quạt không tác dụng | Chọn MANUAL trước |
| Slider không bật được đèn | Gương phải ACTIVE; slider không đánh thức gương |
| Ra xa mà đèn chưa tắt | Chờ 120 giây, không kích hoạt PIR và không ở vùng 25–<60 cm |
| Thiết bị nhận lệnh lạ | Có thể trùng topic với người khác; đổi tiền tố ở cả code và flow |

## 14. Chân nối và demo thuyết trình

| Thiết bị | Chân ESP32 |
| --- | --- |
| DHT22 SDA | GPIO15 |
| PIR OUT | GPIO36, nhãn VP |
| HC-SR04 TRIG / ECHO | GPIO13 / GPIO14 |
| LED trắng | GPIO26 qua điện trở 330Ω |
| LED xanh | GPIO27 qua điện trở 330Ω |

Thứ tự demo đề xuất:

1. Giới thiệu cảm biến → ESP32 → MQTT → Node-RED.
2. Đặt khoảng cách 40 cm để đèn sáng.
3. Thay nhiệt độ/độ ẩm, xem Serial và Debug.
4. AUTO: tăng 33°C, giảm 31°C rồi 29°C để minh họa hai ngưỡng.
5. MANUAL: bật/tắt quạt từ Dashboard; kéo slider đèn.
6. PIR: Simulate Motion và quan sát NEXT trong Debug 4.
7. Rời xa 300 cm, dừng PIR và chờ SLEEP.

Hướng dẫn trên dành cho mô phỏng. Nếu làm mạch thật, ECHO 5V của HC-SR04 thông dụng cần hạ mức trước ESP32; quạt thật cần driver/relay phù hợp, không nối trực tiếp GPIO.

Code đã build thành công trong môi trường Linux với cấu hình đi kèm. Chưa chạy bộ cài Windows trong phiên biên soạn; các bước Windows dựa trên tài liệu chính thức được liên kết bên trên. Trước thuyết trình, thử đủ các bước demo trên máy sử dụng.
