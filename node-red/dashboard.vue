<template>
  <main class="sm" :class="{ 'sm-mirror': mirror, 'sm-sleep': mirror && !s.active }">
    <template v-if="!mirror || s.active">
      <header class="sm-header">
        <div><span class="sm-eyebrow">SMART MIRROR / {{ mirror ? 'GƯƠNG' : 'ĐIỀU KHIỂN' }}</span><h1>{{ mirror ? pages[s.page || 0] : 'Không gian của bạn' }}</h1></div>
        <span class="sm-status" :class="{ok:connected && s.online}">{{ !connected ? 'Mất kết nối Dashboard' : s.online ? 'ESP32 trực tuyến' : 'Chờ ESP32 / dữ liệu mới' }}</span>
      </header>
      <div v-if="!connected || !s.online" class="sm-notice">{{ !connected ? 'Đang kết nối lại Node-RED. Dữ liệu có thể đã cũ.' : 'Dữ liệu phòng chưa sẵn sàng. Điều khiển tạm khóa.' }}</div>
      <div v-if="s.error && !mirror" class="sm-notice">{{ s.error }}</div>
      <div v-for="r in s.reminders || []" :key="r.id" class="sm-notice">Sắp đến giờ · {{ r.title }} — {{ date(r.at) }}</div>
      <div v-for="a in s.alerts || []" :key="a" class="sm-notice">{{ a }}</div>

      <section v-if="!mirror || s.page === 0" class="sm-overview">
        <div class="sm-clock"><div>{{ time }}</div><p>{{ today }}</p><small>Giờ Việt Nam · UTC+7</small></div>
        <div class="sm-metrics">
          <article><span>Nhiệt độ phòng</span><strong>{{ reading('temperature') }}<small> °C</small></strong><small>{{ freshness('temperature') }}</small></article>
          <article><span>Độ ẩm phòng</span><strong>{{ reading('humidity') }}<small> %</small></strong><small>{{ freshness('humidity') }}</small></article>
          <article><span>Quạt · {{ s.device?.mode || '--' }}</span><strong>{{ connected && s.online ? (s.device?.fan === 'ON' ? 'Bật' : s.device?.fan === 'OFF' ? 'Tắt' : '--') : '--' }}</strong><small>AUTO: bật ≥32°C · tắt ≤30°C</small></article>
          <article><span>Đèn gương</span><strong>{{ connected && s.online && s.device?.light != null ? Math.round(s.device.light / 255 * 100) + '%' : '--' }}</strong><small>{{ s.active ? 'Gương đang hoạt động' : 'Gương đang ngủ' }}</small></article>
        </div>
      </section>

      <section v-if="!mirror || s.page === 1" class="sm-panel">
        <div class="sm-section-title"><h2>Thời tiết bên ngoài</h2><button v-if="!mirror" @click="act('refreshWeather')" :disabled="!s.location">Cập nhật</button></div>
        <p>{{ s.location?.name || 'Chọn vị trí ở phần cài đặt bên dưới' }}</p>
        <template v-if="s.weather">
          <div class="sm-weather"><strong>{{ s.weather.current.temperature_2m }}°</strong><div>{{ weatherName(s.weather.current.weather_code) }}<p>Độ ẩm {{ s.weather.current.relative_humidity_2m }}% · Gió {{ s.weather.current.wind_speed_10m }} km/h</p></div></div>
          <div class="sm-forecast"><article v-for="(day,i) in s.weather.daily.time" :key="day"><b>{{ day }}</b><span>{{ weatherName(s.weather.daily.weather_code[i]) }}</span><strong>{{ s.weather.daily.temperature_2m_min[i] }}° – {{ s.weather.daily.temperature_2m_max[i] }}°</strong><small>Mưa {{ s.weather.daily.precipitation_probability_max[i] }}%</small></article></div>
          <small>{{ s.weatherStale ? 'Dữ liệu thời tiết cũ · ' : '' }}Cập nhật {{ date(s.weather.at) }}</small>
        </template>
        <p v-else>Chưa có dữ liệu thời tiết.</p><p v-if="s.weatherError" class="sm-notice">{{ s.weatherError }}</p>
        <small>Nguồn: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> · Số liệu ngoài trời khác cảm biến trong phòng.</small>
      </section>

      <section v-if="!mirror || s.page === 2" class="sm-panel">
        <h2>Lịch & nhắc việc</h2><p>Nhắc trên gương trước 15 phút · Giờ Việt Nam</p>
        <p v-if="!visibleTasks.length">Chưa có lịch sắp tới. Thêm việc ở trang Điều khiển.</p>
        <div v-for="t in visibleTasks" :key="t.id" class="sm-task" :class="{done:t.done}"><div><b>{{ t.title }}</b><small>{{ date(t.at) }}{{ !t.done && t.at < clock ? ' · Đã quá giờ' : '' }}</small></div><div v-if="!mirror"><button @click="act('toggleTask',{id:t.id})">{{ t.done ? 'Mở lại' : 'Xong' }}</button><button @click="act('deleteTask',{id:t.id})">Xóa</button></div></div>
        <form v-if="!mirror" class="sm-form" @submit.prevent="addTask"><label>Tên công việc<input v-model="taskTitle" maxlength="120" required placeholder="Ví dụ: Họp nhóm đồ án"></label><label>Thời gian (giờ Việt Nam)<input v-model="taskAt" type="datetime-local" required></label><button type="submit">Thêm nhắc việc</button></form>
        <small>Danh sách nhập trực tiếp; chưa đồng bộ Google Calendar. Không có thông báo khi trình duyệt đóng.</small>
      </section>

      <template v-if="!mirror">
        <section class="sm-panel"><h2>Điều khiển thiết bị</h2><p>Trạng thái được xác nhận từ ESP32; đèn chỉ điều chỉnh khi gương ACTIVE.</p>
          <div class="sm-controls"><label>Chế độ quạt<select :value="s.device?.mode || ''" :disabled="!canControl" @change="control('mode',$event.target.value)"><option disabled value="">Chưa xác nhận</option><option>AUTO</option><option>MANUAL</option></select></label>
          <button :disabled="!canControl || s.device?.mode !== 'MANUAL' || !!s.pending?.fan" @click="control('fan',s.device?.fan === 'ON' ? 'OFF' : 'ON')">{{ s.device?.fan === 'ON' ? 'Tắt quạt' : 'Bật quạt' }}</button>
          <label>Độ sáng mong muốn: {{ brightness }}/255<input v-model.number="brightness" type="range" min="0" max="255" :disabled="!canControl || !s.active" @change="control('light',Number(brightness))"></label></div>
          <p v-if="Object.keys(s.pending || {}).length">Đang chờ ESP32 xác nhận…</p>
          <button :disabled="!canControl || !s.active" @click="act('next')">Trang tiếp theo trên gương →</button><small>Trang hiện tại: {{ pages[s.page || 0] }} · <a href="./guong">Mở màn hình gương</a></small>
        </section>
        <section class="sm-panel"><h2>Vị trí thời tiết</h2><p>Vị trí dùng chung cho gương. Tọa độ được lưu tại Node-RED và gửi tới Open-Meteo khi lấy thời tiết.</p>
          <form class="sm-form" @submit.prevent="act('search',{query:query})"><label>Tỉnh / thành phố<input v-model="query" minlength="2" maxlength="80" required placeholder="Đà Nẵng, Hà Nội…"></label><button type="submit">Tìm địa điểm</button><button type="button" @click="locate">Dùng vị trí của tôi</button></form>
          <p v-if="localError" class="sm-notice">{{ localError }}</p><div class="sm-places"><button v-for="p in s.places || []" :key="p.lat + ',' + p.lon" @click="act('location',p)">{{ p.name }}</button></div>
          <small v-if="s.location">Đang dùng: {{ s.location.name }} · {{ s.location.lat }}, {{ s.location.lon }}</small><button v-if="s.location" @click="act('clearLocation')">Xóa vị trí đã lưu</button>
        </section>
        <section class="sm-panel"><div class="sm-section-title"><h2>Lịch sử nhiệt độ · 24 giờ</h2><button @click="exportHistory" :disabled="!s.history?.length">Xuất CSV</button></div><p>Mỗi phút một mẫu hợp lệ; khoảng trống thể hiện thời gian thiếu dữ liệu.</p>
          <svg v-if="s.history?.length" class="sm-chart" viewBox="0 0 800 160" role="img" aria-label="Biểu đồ nhiệt độ 24 giờ"><text x="4" y="16" fill="currentColor">{{ chartMax }}°C</text><text x="4" y="150" fill="currentColor">{{ chartMin }}°C</text><polyline v-for="(line,i) in chartLines" :key="i" :points="line" fill="none" stroke="#64d9bd" stroke-width="2"/><circle v-for="(h,i) in s.history" :key="i" :cx="chartX(h.at)" :cy="chartY(h.temperature)" r="2" fill="#64d9bd"/></svg><p v-else>Chưa có mẫu hợp lệ. Bật Wokwi và chờ dữ liệu.</p><small>Lịch sử phiên chạy hiện tại · nhiệt độ / độ ẩm có trong CSV.</small>
        </section>
      </template>
      <footer><span>{{ mirror ? 'Nhấn nút trên gương để chuyển trang' : 'ESP32 → MQTT → Node-RED' }}</span><span v-if="mirror">{{ (s.page || 0) + 1 }} / 3</span></footer>
    </template>
    <span v-else class="sm-sleep-label">{{ connected ? 'Gương đang ngủ · Đến gần để bật' : 'Mất kết nối Node-RED' }}</span>
  </main>
</template>
<script>
export default {
  data() { return { mirror: __MIRROR__, s:{}, clock:Date.now(), connected:true, timer:null, query:'', taskTitle:'', taskAt:'', brightness:180, localError:'', pages:['Tổng quan','Thời tiết','Lịch & nhắc việc'] } },
  computed: {
    time() { return new Date(this.clock).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'}) },
    today() { return new Date(this.clock).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',weekday:'long',day:'numeric',month:'long',year:'numeric'}) },
    canControl() { return this.connected && this.s.online },
    visibleTasks() { return (this.s.tasks || []).filter(t => !this.mirror || (!t.done && t.at >= this.clock - 86400000)).slice(0,this.mirror ? 8 : 100) },
    chartMin() { return Math.floor(Math.min(...(this.s.history || []).map(h=>h.temperature),25)-1) },
    chartMax() { return Math.ceil(Math.max(...(this.s.history || []).map(h=>h.temperature),30)+1) },
    chartLines() { const groups=[[]]; for(const h of this.s.history || []) { let g=groups[groups.length-1]; if(g.length && h.at-g[g.length-1].at>90000) { groups.push([]); g=groups[groups.length-1] } g.push(h) } return groups.map(g=>g.map(h=>this.chartX(h.at)+','+this.chartY(h.temperature)).join(' ')) }
  },
  watch: { msg: { immediate:true, handler(m) { if(m?.payload?.readings) { this.s=m.payload; if(!m.payload.pending?.light && m.payload.device?.light != null) this.brightness=m.payload.device.light } } } },
  mounted() { this.timer=setInterval(()=>{this.clock=Date.now();this.connected=this.$socket.connected},1000); this.send({topic:'ui',payload:{action:'load'}}) },
  unmounted() { clearInterval(this.timer) },
  methods: {
    act(action,extra={}) { this.send({topic:'ui',payload:{action,...extra}}) },
    control(key,value) { this.act('control',{key,value}) },
    reading(k) { return this.connected && this.s.fresh?.[k] && this.clock-(this.s.readings[k]?.at || 0)<15000 ? this.s.readings[k].value.toFixed(1) : '--' },
    freshness(k) { const r=this.s.readings?.[k]; return !r ? 'Chưa có số đo' : 'Đo lúc '+this.date(r.at) },
    date(at) { return new Date(at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}) },
    weatherName(code) { if(code===0)return 'Trời quang';if(code<=3)return 'Có mây';if(code<=48)return 'Sương mù';if(code<=57)return 'Mưa phùn';if(code<=67)return 'Mưa';if(code<=77)return 'Tuyết';if(code<=86)return 'Mưa rào';return 'Dông' },
    addTask() { this.act('addTask',{title:this.taskTitle,at:this.taskAt+':00+07:00'}); this.taskTitle=''; this.taskAt='' },
    locate() { this.localError=''; if(!window.isSecureContext || !navigator.geolocation) {this.localError='Định vị cần HTTPS hoặc localhost. Bạn có thể tìm tên tỉnh/thành ở ô bên cạnh.';return} navigator.geolocation.getCurrentPosition(p=>this.act('location',{lat:p.coords.latitude,lon:p.coords.longitude,name:'Vị trí của tôi'}),e=>{this.localError=e.code===1?'Bạn chưa cho phép định vị. Hãy cho phép trong trình duyệt hoặc tìm địa điểm.':'Không lấy được vị trí. Thử lại hoặc tìm tên địa điểm.'},{timeout:15000,maximumAge:300000}) },
    chartX(at) { return 50+((at-(this.s.now-86400000))/86400000)*740 },
    chartY(t) { return 145-(t-this.chartMin)/(this.chartMax-this.chartMin)*125 },
    exportHistory() { const rows=['time,temperature_c,humidity_pct',...(this.s.history || []).map(h=>new Date(h.at).toISOString()+','+h.temperature+','+h.humidity)];const url=URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='smartmirror-history.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000) }
  }
}
</script>
<style>
body:has(.sm-mirror) .v-app-bar,body:has(.sm-mirror) .v-navigation-drawer{display:none!important}body:has(.sm-mirror) .v-main{--v-layout-top:0px!important;--v-layout-left:0px!important;background:#000!important}body:has(.sm-mirror) .nrdb-ui-group{background:#000!important;border:0!important}
.sm{background:#10191e;color:#ecf4f3;padding:clamp(18px,4vw,48px);border-radius:18px;font-family:system-ui,sans-serif;line-height:1.6}.sm *{box-sizing:border-box}.sm h1{font-size:clamp(25px,4vw,40px);font-weight:500;margin:4px 0}.sm h2{font-size:22px;font-weight:500;margin:0 0 10px}.sm p{color:#afc3c7;margin:8px 0 16px}.sm small{display:block;color:#9eb4ba;font-size:12px}.sm a{color:#83d9c3}.sm-header,.sm-section-title,.sm-task,.sm footer{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.sm-eyebrow{font-size:11px;letter-spacing:3px;color:#8bc4ba}.sm-status{font-size:12px;padding:7px 12px;border:1px solid #6c5940;border-radius:24px;color:#edc48d}.sm-status.ok{color:#8edec0;border-color:#376c59}.sm-overview{display:grid;grid-template-columns:1fr 1.5fr;gap:28px;margin:35px 0}.sm-clock>div{font-size:clamp(55px,9vw,105px);line-height:1.2;font-weight:300;letter-spacing:-4px;font-variant-numeric:tabular-nums}.sm-metrics{display:grid;grid-template-columns:1fr 1fr;gap:12px}.sm-metrics article,.sm-forecast article{padding:18px;background:#18262d;border:1px solid #2c3d43;border-radius:12px}.sm-metrics span{font-size:13px;color:#b7cacc}.sm-metrics strong{display:block;font-size:30px;font-weight:500}.sm-metrics strong small{display:inline;font-size:16px}.sm-panel{border-top:1px solid #304147;padding:28px 0}.sm-weather{display:flex;align-items:center;gap:24px;margin:20px 0}.sm-weather>strong{font-size:68px;font-weight:300}.sm-forecast{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}.sm-forecast span,.sm-forecast strong{display:block}.sm button,.sm input,.sm select{font:inherit;border:1px solid #425b62;border-radius:8px;padding:10px 14px;color:#edf6f4;background:#1d333a}.sm button{cursor:pointer;min-height:44px}.sm button:hover{background:#2b4a51}.sm button:disabled,.sm input:disabled,.sm select:disabled{opacity:.45;cursor:not-allowed}.sm input,.sm select{width:100%;margin-top:6px}.sm input[type=range]{padding:0;accent-color:#83d9c3;min-height:35px}.sm label{display:block;font-size:13px;color:#bfd1d3}.sm-form,.sm-controls{display:flex;gap:14px;align-items:end;flex-wrap:wrap;margin:20px 0}.sm-form label,.sm-controls label{flex:1;min-width:200px}.sm-notice{border-left:3px solid #e2b977;background:#302c24;padding:10px 16px;margin:12px 0;color:#f2d6ac}.sm-task{border-bottom:1px solid #304147;padding:14px 0}.sm-task.done b{text-decoration:line-through;color:#94aaa9}.sm-task button{margin-left:6px}.sm-places{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}.sm-chart{width:100%;height:auto;max-height:230px;margin:20px 0}.sm footer{border-top:1px solid #304147;padding-top:20px;margin-top:25px;font-size:12px;color:#829ca3}.sm-mirror{background:#000;min-height:85vh;border-radius:0}.sm-sleep{display:flex;align-items:end;justify-content:center}.sm-sleep-label{color:#444;font-size:12px}.sm-mirror .sm-metrics article,.sm-mirror .sm-forecast article{background:#000;border-color:#333}.sm-mirror .sm-notice{background:#15120d}.sm-mirror .sm-header{margin-bottom:35px}@media(max-width:700px){.sm-overview{grid-template-columns:1fr}.sm-forecast{grid-template-columns:1fr}.sm-form>*{width:100%}.sm{padding:18px}.sm-task{align-items:start}.sm-header{align-items:start}.sm-mirror{min-height:90vh}.sm-metrics article{padding:13px}}
</style>
