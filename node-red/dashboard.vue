<template>
  <main class="sm" :class="{ 'sm-mirror': mirror, 'sm-sleep': mirror && !mirrorAwake }">
    <template v-if="!mirror || mirrorAwake">
      <header class="sm-header">
        <div><span class="sm-eyebrow">SMART MIRROR / {{ mirror ? 'GƯƠNG' : 'LỊCH CỦA TÔI' }}</span><h1>{{ mirror ? pages[s.page || 0] : 'Lịch hoạt động' }}</h1></div>
        <span class="sm-status" :class="{ok:connected && s.online}">{{ !connected ? 'Mất kết nối Dashboard' : s.online ? 'ESP32 trực tuyến' : 'Chờ ESP32 / dữ liệu mới' }}</span>
      </header>
      <div v-if="!connected || !s.online" class="sm-notice">{{ !connected ? 'Đang kết nối lại Node-RED. Dữ liệu có thể đã cũ.' : 'Chưa xác nhận kết nối với ESP32. Điều khiển tạm khóa.' }}</div>
      <div v-if="s.error && !mirror" class="sm-notice">{{ s.error }}</div>
      <div v-for="r in s.reminders || []" :key="r.id" class="sm-notice">Sắp đến giờ · {{ r.title }} — {{ date(r.at) }}</div>
      <div v-for="a in s.alerts || []" :key="a" class="sm-notice">{{ a }}</div>
      <section v-if="mirror && s.active" class="sm-wake-agenda"><span class="sm-eyebrow">HÔM NAY · {{ today }}</span><h2>Lịch trong ngày</h2><p v-if="!todayTasks.length">Hôm nay chưa có hoạt động nào được lên lịch.</p><div v-for="t in todayTasks" :key="t.id" class="sm-wake-event"><b>{{ timeOnly(t.at) }}</b><span>{{ t.title }}</span></div></section>

      <section v-if="!mirror || s.page === 0" class="sm-overview">
        <div class="sm-clock"><div>{{ time }}</div><p>{{ today }}</p><small>Giờ Việt Nam · UTC+7</small></div>
        <div class="sm-metrics">
          <article><span>Nhiệt độ phòng</span><strong>{{ reading('temperature') }}<small> °C</small></strong><small>{{ freshness('temperature') }}</small></article>
          <article><span>Độ ẩm phòng</span><strong>{{ reading('humidity') }}<small> %</small></strong><small>{{ freshness('humidity') }}</small></article>
          <article><span>Đèn gương tự động</span><strong>{{ connected && s.online ? (s.device?.lamp === 'ON' ? 'Đang sáng' : s.device?.lamp === 'OFF' ? 'Đang tắt' : '--') : '--' }}</strong><small>Tự bật khi có người và phòng tối</small></article>
          <article><span>Độ sáng màn hình</span><strong>{{ connected && s.online && s.device?.light != null ? Math.round(s.device.light / 255 * 100) + '%' : '--' }}</strong><small>{{ s.device?.lightSensor === 'FALLBACK' ? 'Cảm biến lỗi · dùng mức dự phòng' : 'Tự cân theo ánh sáng phòng · đèn gương cũng tự động' }}</small></article>
        </div>
      </section>

      <section v-if="!mirror" class="sm-panel sm-calendar">
        <div class="sm-section-title"><div><span class="sm-eyebrow">SẮP XẾP NGÀY CỦA BẠN</span><h2>{{ monthLabel }}</h2></div><div class="sm-month-nav"><button aria-label="Tháng trước" @click="shiftMonth(-1)">‹</button><button @click="goToday">Hôm nay</button><button aria-label="Tháng sau" @click="shiftMonth(1)">›</button></div></div>
        <div class="sm-calendar-layout"><div class="sm-calendar-grid"><div v-for="d in weekdays" :key="d" class="sm-weekday">{{ d }}</div><button v-for="cell in calendarCells" :key="cell.key" class="sm-day" :class="{outside:cell.outside,selected:cell.key===selectedDay,today:cell.today}" @click="selectedDay=cell.key"><span>{{ cell.day }}</span><i v-if="cell.count" class="sm-day-dot">{{ cell.count > 9 ? '9+' : cell.count }}</i></button></div>
          <aside class="sm-agenda"><div class="sm-agenda-heading"><div><span class="sm-eyebrow">HOẠT ĐỘNG TRONG NGÀY</span><h3>{{ selectedDateLabel }}</h3></div><button class="sm-primary" @click="newTask">＋ Thêm</button></div><p v-if="!selectedTasks.length" class="sm-empty">Ngày này chưa có hoạt động. Thêm lịch hẹn, việc cần làm hoặc sự kiện.</p><article v-for="t in selectedTasks" :key="t.id" class="sm-calendar-event" :class="{done:t.done}"><time>{{ timeOnly(t.at) }}</time><div class="sm-event-info"><b>{{ t.title }}</b><small>{{ t.done ? 'Đã hoàn thành' : 'Đã lên lịch' }}</small></div><button :aria-label="t.done ? 'Mở lại hoạt động' : 'Đánh dấu hoàn thành'" @click="act('toggleTask',{id:t.id})">✓</button><button aria-label="Sửa hoạt động" @click="editTask(t)">✎</button><button aria-label="Xóa hoạt động" @click="act('deleteTask',{id:t.id})">×</button></article></aside></div>
        <div v-if="editorOpen" class="sm-modal-backdrop" @click.self="editorOpen=false"><form class="sm-modal" @submit.prevent="saveTask"><div class="sm-section-title"><h3>{{ editorId ? 'Sửa hoạt động' : 'Hoạt động mới' }}</h3><button type="button" aria-label="Đóng" @click="editorOpen=false">×</button></div><label>Tên hoạt động<input v-model="taskTitle" maxlength="120" required autofocus placeholder="Ví dụ: Họp nhóm, tập thể dục…"></label><label>Ngày và giờ<input v-model="taskAt" type="datetime-local" required></label><div class="sm-modal-actions"><button type="button" @click="editorOpen=false">Hủy</button><button class="sm-primary" type="submit">Lưu hoạt động</button></div></form></div>
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

      <section v-if="mirror && s.page === 2" class="sm-panel"><h2>Lịch hoạt động hôm nay</h2><p>{{ today }}</p><p v-if="!todayTasks.length">Hôm nay chưa có hoạt động nào được lên lịch.</p><div v-for="t in todayTasks" :key="t.id" class="sm-task"><b>{{ timeOnly(t.at) }} · {{ t.title }}</b></div></section>



      <template v-if="!mirror">
        <section class="sm-panel"><h2>Vị trí thời tiết</h2><p>Vị trí dùng chung cho gương. Tọa độ được lưu tại Node-RED và gửi tới Open-Meteo khi lấy thời tiết.</p>
          <form class="sm-form" @submit.prevent="act('search',{query:query})"><label>Tỉnh / thành phố<input v-model="query" minlength="2" maxlength="80" required placeholder="Đà Nẵng, Hà Nội…"></label><button type="submit">Tìm địa điểm</button><button type="button" @click="locate">Dùng vị trí của tôi</button></form>
          <p v-if="localError" class="sm-notice">{{ localError }}</p><div class="sm-places"><button v-for="p in s.places || []" :key="p.lat + ',' + p.lon" @click="act('location',p)">{{ p.name }}</button></div>
          <small v-if="s.location">Đang dùng: {{ s.location.name }} · {{ s.location.lat }}, {{ s.location.lon }}</small><button v-if="s.location" @click="act('clearLocation')">Xóa vị trí đã lưu</button>
        </section>
        <section class="sm-panel"><div class="sm-section-title"><h2>Lịch sử nhiệt độ · 24 giờ</h2><button @click="exportHistory" :disabled="!s.history?.length">Xuất CSV</button></div><p>Mỗi phút một mẫu hợp lệ; khoảng trống thể hiện thời gian thiếu dữ liệu.</p>
          <svg v-if="s.history?.length" class="sm-chart" viewBox="0 0 800 160" role="img" aria-label="Biểu đồ nhiệt độ 24 giờ"><text x="4" y="16" fill="currentColor">{{ chartMax }}°C</text><text x="4" y="150" fill="currentColor">{{ chartMin }}°C</text><polyline v-for="(line,i) in chartLines" :key="i" :points="line" fill="none" stroke="#64d9bd" stroke-width="2"/><circle v-for="(h,i) in s.history" :key="i" :cx="chartX(h.at)" :cy="chartY(h.temperature)" r="2" fill="#64d9bd"/></svg><p v-else>Chưa có mẫu hợp lệ. Bật Wokwi và chờ dữ liệu.</p><small>Lịch sử phiên chạy hiện tại · nhiệt độ / độ ẩm có trong CSV.</small>
        </section>
      </template>
      <footer><span>{{ mirror ? 'Vuốt trái / phải trên màn hình để chuyển trang' : 'Ứng dụng lịch · Đồng bộ với gương thông minh' }}</span><span v-if="mirror">{{ (s.page || 0) + 1 }} / 3</span></footer>
    </template>
    <span v-else class="sm-sleep-label">{{ !connected ? 'Mất kết nối Node-RED' : !s.online ? 'Chờ kết nối ESP32' : 'Gương đang ngủ · Đến gần để bật' }}</span>
  </main>
</template>
<script>
export default {
  data() { const day=new Date(Date.now()+7*3600000).toISOString().slice(0,10); return { mirror: __MIRROR__, s:{}, clock:Date.now(), connected:true, timer:null, query:'', taskTitle:'', taskAt:'', editorId:null, editorOpen:false, calendarCursor:day, selectedDay:day, localError:'', weekdays:['T2','T3','T4','T5','T6','T7','CN'], pages:['Tổng quan','Thời tiết','Lịch hôm nay'] } },
  computed: {
    time() { return new Date(this.clock).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit'}) },
    today() { return new Date(this.clock).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',weekday:'long',day:'numeric',month:'long',year:'numeric'}) },
    canControl() { return this.connected && this.s.online },
    mirrorAwake() { return this.canControl && this.s.active },
    todayKey() { return new Date(this.clock+7*3600000).toISOString().slice(0,10) },
    todayTasks() { return (this.s.tasks || []).filter(t => this.dayKey(t.at)===this.todayKey).slice(0,8) },
    selectedTasks() { return (this.s.tasks || []).filter(t => this.dayKey(t.at)===this.selectedDay) },
    monthLabel() { const [y,m]=this.calendarCursor.split('-').map(Number);return new Intl.DateTimeFormat('vi-VN',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,1))) },
    selectedDateLabel() { const [y,m,d]=this.selectedDay.split('-').map(Number);return new Intl.DateTimeFormat('vi-VN',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,d))) },
    calendarCells() { const [y,m]=this.calendarCursor.split('-').map(Number),first=new Date(Date.UTC(y,m-1,1)),offset=(first.getUTCDay()+6)%7,start=Date.UTC(y,m-1,1-offset);return Array.from({length:42},(_,i)=>{const d=new Date(start+i*86400000),key=d.toISOString().slice(0,10);return {key,day:d.getUTCDate(),outside:d.getUTCMonth()!==m-1,today:key===this.todayKey,count:(this.s.tasks||[]).filter(t=>this.dayKey(t.at)===key).length}}) },
    chartMin() { return Math.floor(Math.min(...(this.s.history || []).map(h=>h.temperature),25)-1) },
    chartMax() { return Math.ceil(Math.max(...(this.s.history || []).map(h=>h.temperature),30)+1) },
    chartLines() { const groups=[[]]; for(const h of this.s.history || []) { let g=groups[groups.length-1]; if(g.length && h.at-g[g.length-1].at>90000) { groups.push([]); g=groups[groups.length-1] } g.push(h) } return groups.map(g=>g.map(h=>this.chartX(h.at)+','+this.chartY(h.temperature)).join(' ')) }
  },
  watch: { msg: { immediate:true, handler(m) { const next=m?.payload;if(next?.readings)this.s=next } } },
  mounted() { this.timer=setInterval(()=>{this.clock=Date.now();this.connected=this.$socket.connected},1000); this.send({topic:'ui',payload:{action:'load'}}) },
  unmounted() { clearInterval(this.timer) },
  methods: {
    act(action,extra={}) { this.send({topic:'ui',payload:{action,...extra}}) },
    reading(k) { return this.connected && this.s.fresh?.[k] && this.clock-(this.s.readings[k]?.at || 0)<15000 ? this.s.readings[k].value.toFixed(1) : '--' },
    freshness(k) { const r=this.s.readings?.[k]; return !r ? 'Chưa có số đo' : 'Đo lúc '+this.date(r.at) },
    date(at) { return new Date(at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}) },
    weatherName(code) { if(code===0)return 'Trời quang';if(code<=3)return 'Có mây';if(code<=48)return 'Sương mù';if(code<=57)return 'Mưa phùn';if(code<=67)return 'Mưa';if(code<=77)return 'Tuyết';if(code<=86)return 'Mưa rào';return 'Dông' },
    dayKey(at) { return new Date(at+7*3600000).toISOString().slice(0,10) },
    timeOnly(at) { return new Date(at+7*3600000).toISOString().slice(11,16) },
    shiftMonth(delta) { const [y,m]=this.calendarCursor.split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1));this.calendarCursor=d.toISOString().slice(0,7)+'-01';this.selectedDay=this.calendarCursor },
    goToday() { this.calendarCursor=this.todayKey;this.selectedDay=this.todayKey },
    newTask() { this.editorId=null;this.taskTitle='';this.taskAt=this.selectedDay+'T09:00';this.editorOpen=true },
    editTask(t) { this.editorId=t.id;this.taskTitle=t.title;this.taskAt=new Date(t.at+7*3600000).toISOString().slice(0,16);this.editorOpen=true },
    saveTask() { this.act('saveTask',{id:this.editorId,title:this.taskTitle,at:this.taskAt+':00+07:00'});this.editorOpen=false;this.taskTitle='';this.taskAt='';this.editorId=null },
    locate() { this.localError=''; if(!window.isSecureContext || !navigator.geolocation) {this.localError='Định vị cần HTTPS hoặc localhost. Bạn có thể tìm tên tỉnh/thành ở ô bên cạnh.';return} navigator.geolocation.getCurrentPosition(p=>this.act('location',{lat:p.coords.latitude,lon:p.coords.longitude,name:'Vị trí của tôi'}),e=>{this.localError=e.code===1?'Bạn chưa cho phép định vị. Hãy cho phép trong trình duyệt hoặc tìm địa điểm.':'Không lấy được vị trí. Thử lại hoặc tìm tên địa điểm.'},{timeout:15000,maximumAge:300000}) },
    chartX(at) { return 50+((at-(this.s.now-86400000))/86400000)*740 },
    chartY(t) { return 145-(t-this.chartMin)/(this.chartMax-this.chartMin)*125 },
    exportHistory() { const rows=['time,temperature_c,humidity_pct',...(this.s.history || []).map(h=>new Date(h.at).toISOString()+','+h.temperature+','+h.humidity)];const url=URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='smartmirror-history.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000) }
  }
}
</script>
<style>
body:has(.sm-mirror) .v-app-bar,body:has(.sm-mirror) .v-navigation-drawer,body:has(.sm-calendar) .v-app-bar,body:has(.sm-calendar) .v-navigation-drawer{display:none!important}body:has(.sm-mirror) .v-main{--v-layout-top:0px!important;--v-layout-left:0px!important;background:#000!important}body:has(.sm-calendar) .v-main{--v-layout-top:0px!important;background:#081014!important}body:has(.sm-mirror) .nrdb-ui-group{background:#000!important;border:0!important}
.sm{background:#10191e;color:#ecf4f3;padding:clamp(18px,4vw,48px);border-radius:18px;font-family:system-ui,sans-serif;line-height:1.6}.sm *{box-sizing:border-box}.sm h1{font-size:clamp(25px,4vw,40px);font-weight:500;margin:4px 0}.sm h2{font-size:22px;font-weight:500;margin:0 0 10px}.sm p{color:#afc3c7;margin:8px 0 16px}.sm small{display:block;color:#9eb4ba;font-size:12px}.sm a{color:#83d9c3}.sm-header,.sm-section-title,.sm-task,.sm footer{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.sm-eyebrow{font-size:11px;letter-spacing:3px;color:#8bc4ba}.sm-status{font-size:12px;padding:7px 12px;border:1px solid #6c5940;border-radius:24px;color:#edc48d}.sm-status.ok{color:#8edec0;border-color:#376c59}.sm-overview{display:grid;grid-template-columns:1fr 1.5fr;gap:28px;margin:35px 0}.sm-clock>div{font-size:clamp(55px,9vw,105px);line-height:1.2;font-weight:300;letter-spacing:-4px;font-variant-numeric:tabular-nums}.sm-metrics{display:grid;grid-template-columns:1fr 1fr;gap:12px}.sm-metrics article,.sm-forecast article{padding:18px;background:#18262d;border:1px solid #2c3d43;border-radius:12px}.sm-metrics span{font-size:13px;color:#b7cacc}.sm-metrics strong{display:block;font-size:30px;font-weight:500}.sm-metrics strong small{display:inline;font-size:16px}.sm-panel{border-top:1px solid #304147;padding:28px 0}.sm-weather{display:flex;align-items:center;gap:24px;margin:20px 0}.sm-weather>strong{font-size:68px;font-weight:300}.sm-forecast{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}.sm-forecast span,.sm-forecast strong{display:block}.sm button,.sm input,.sm select{font:inherit;border:1px solid #425b62;border-radius:8px;padding:10px 14px;color:#edf6f4;background:#1d333a}.sm button{cursor:pointer;min-height:44px}.sm button:hover{background:#2b4a51}.sm button:disabled,.sm input:disabled,.sm select:disabled{opacity:.45;cursor:not-allowed}.sm input,.sm select{width:100%;margin-top:6px}.sm input[type=range]{padding:0;accent-color:#83d9c3;min-height:35px}.sm label{display:block;font-size:13px;color:#bfd1d3}.sm-form,.sm-controls{display:flex;gap:14px;align-items:end;flex-wrap:wrap;margin:20px 0}.sm-form label,.sm-controls label{flex:1;min-width:200px}.sm-notice{border-left:3px solid #e2b977;background:#302c24;padding:10px 16px;margin:12px 0;color:#f2d6ac}.sm-task{border-bottom:1px solid #304147;padding:14px 0}.sm-task.done b{text-decoration:line-through;color:#94aaa9}.sm-task button{margin-left:6px}.sm-places{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}.sm-chart{width:100%;height:auto;max-height:230px;margin:20px 0}.sm footer{border-top:1px solid #304147;padding-top:20px;margin-top:25px;font-size:12px;color:#829ca3}.sm-mirror{background:#000;min-height:85vh;border-radius:0}.sm-sleep{display:flex;align-items:end;justify-content:center}.sm-sleep-label{color:#444;font-size:12px}.sm-mirror .sm-metrics article,.sm-mirror .sm-forecast article{background:#000;border-color:#333}.sm-mirror .sm-notice{background:#15120d}.sm-mirror .sm-header{margin-bottom:35px}@media(max-width:700px){.sm-overview{grid-template-columns:1fr}.sm-forecast{grid-template-columns:1fr}.sm-form>*{width:100%}.sm{padding:18px}.sm-task{align-items:start}.sm-header{align-items:start}.sm-mirror{min-height:90vh}.sm-metrics article{padding:13px}}
.sm-calendar{border:1px solid #263c40;border-radius:20px;background:linear-gradient(145deg,#132326,#10191e 65%);padding:clamp(16px,3vw,28px);margin:28px 0}.sm-calendar .sm-section-title{margin-bottom:20px}.sm-calendar .sm-section-title h2{margin:2px 0 0;text-transform:capitalize}.sm-month-nav{display:flex;gap:8px}.sm-calendar-layout{display:grid;grid-template-columns:minmax(280px,1.15fr) minmax(280px,.85fr);gap:24px}.sm-calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;align-content:start}.sm-weekday{text-align:center;color:#91aaa9;font-size:12px;padding:8px 0}.sm-day{height:58px;position:relative;display:flex;align-items:flex-start;justify-content:center;padding:8px!important;border:1px solid transparent!important;background:transparent!important;border-radius:12px!important}.sm-day:hover{background:#21383a!important}.sm-day.outside{opacity:.35}.sm-day.selected{background:#1d4844!important;border-color:#71d3b5!important}.sm-day.today span{color:#9ae1c6;font-weight:700}.sm-day-dot{position:absolute;bottom:4px;left:50%;transform:translateX(-50%);font-style:normal;font-size:9px;color:#9ae1c6}.sm-agenda{border-left:1px solid #30484a;padding-left:22px}.sm-agenda-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.sm-agenda-heading h3{font-size:18px;font-weight:500;margin:4px 0;text-transform:capitalize}.sm-primary{background:#75d4b1!important;color:#10201c!important;border-color:#75d4b1!important;font-weight:700}.sm-empty{padding:18px;border:1px dashed #3c5958;border-radius:14px}.sm-calendar-event{display:flex;align-items:center;gap:10px;padding:11px 0;border-bottom:1px solid #2b4041}.sm-calendar-event time{font-variant-numeric:tabular-nums;color:#a6e2cb;font-weight:700;min-width:46px}.sm-event-info{flex:1;min-width:0}.sm-event-info b{display:block;overflow-wrap:anywhere}.sm-event-info small{margin-top:2px}.sm-calendar-event.done .sm-event-info b{text-decoration:line-through;color:#829694}.sm-calendar-event>button{padding:6px 9px;min-width:38px}.sm-modal-backdrop{position:fixed;inset:0;z-index:10000;background:#000a;display:grid;place-items:center;padding:18px}.sm-modal{width:min(100%,440px);padding:22px;background:#152327;border:1px solid #476160;border-radius:18px;box-shadow:0 20px 80px #0008}.sm-modal h3{font-size:21px;font-weight:500;margin:0}.sm-modal label{margin:16px 0}.sm-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.sm-wake-agenda{padding:18px 20px;border:1px solid #284940;border-radius:16px;background:#101b18;margin:20px 0}.sm-wake-agenda h2{margin:2px 0}.sm-wake-event{display:flex;gap:14px;padding:8px 0;border-top:1px solid #283d38}.sm-wake-event b{color:#99e1c4;min-width:48px;font-variant-numeric:tabular-nums}
@media(max-width:760px){.sm-calendar-layout{grid-template-columns:1fr}.sm-agenda{border-left:0;border-top:1px solid #30484a;padding:18px 0 0}.sm-calendar .sm-section-title{align-items:flex-start}.sm-day{height:48px;padding:5px!important}.sm-wake-agenda{padding:15px}}
</style>
