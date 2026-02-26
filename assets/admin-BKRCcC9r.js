import{s as f}from"./supabase-client-ngkqdeIq.js";import"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";let p="week",g=null,E=null;async function F(){let t,a=null;if(p==="custom"&&g&&E)t=g,a=E;else switch(p){case"week":const d=new Date;d.setDate(d.getDate()-7),t=d.toISOString().split("T")[0];break;case"month":const v=new Date;v.setDate(v.getDate()-30),t=v.toISOString().split("T")[0];break;case"all":t="2020-01-01";break;default:const l=new Date;l.setDate(l.getDate()-7),t=l.toISOString().split("T")[0]}let e=f.from("daily_reports").select("*, cashiers(name)").gte("date",t).order("date",{ascending:!1});a&&(e=e.lte("date",a));const[s,i,n]=await Promise.all([f.from("weekly_performance").select("*").order("weekly_points",{ascending:!1}),e,f.from("cashiers").select("*").order("total_points",{ascending:!1})]);return{weekly:s.data||[],reports:i.data||[],cashiers:n.data||[]}}function A(t){const a={};return t.forEach(e=>{const s=`${e.date}-${e.kasa}`;(!a[s]||e.shift==="aksam")&&(a[s]=e)}),Object.values(a).reduce((e,s)=>(e.restoran+=parseFloat(s.rumeli_z2||0),e.cafetarya+=parseFloat(s.rumeli_z1||0),e.balik+=parseFloat(s.balik_ekmek||0),e.dondurma+=parseFloat(s.dondurma||0),e.total+=parseFloat(s.rumeli_z2||0)+parseFloat(s.rumeli_z1||0)+parseFloat(s.balik_ekmek||0)+parseFloat(s.dondurma||0),e),{restoran:0,cafetarya:0,balik:0,dondurma:0,total:0})}function x(t){const a={};t.forEach(i=>{const n=`${i.date}-${i.kasa}`;(!a[n]||i.shift==="aksam")&&(a[n]=i)});const e={};Object.values(a).forEach(i=>{const n=i.date;e[n]||(e[n]=0),e[n]+=parseFloat(i.rumeli_z2||0)+parseFloat(i.rumeli_z1||0)+parseFloat(i.balik_ekmek||0)+parseFloat(i.dondurma||0)});const s=Object.keys(e).sort();return{labels:s.map(i=>I(i)),data:s.map(i=>e[i])}}function z(t){const a={};t.forEach(s=>{const i=`${s.date}-${s.kasa}`;(!a[i]||s.shift==="aksam")&&(a[i]=s)});const e={sabah:0,aksam:0};return Object.values(a).forEach(s=>{const i=parseFloat(s.rumeli_z2||0)+parseFloat(s.rumeli_z1||0)+parseFloat(s.balik_ekmek||0)+parseFloat(s.dondurma||0);s.shift==="sabah"?e.sabah+=i:s.shift==="aksam"&&(e.aksam+=i)}),e}function L(t,a){const e={};return t.forEach(s=>{var n;const i=((n=s.cashiers)==null?void 0:n.name)||"Bilinmiyor";e[i]||(e[i]=0),e[i]+=parseFloat(s.individual_revenue||0)}),e}function K(t,a){const e=new Date().toISOString().split("T")[0],s=t.filter(o=>o.date===e),i=[...new Set(s.map(o=>o.cashier_id))],n=a.filter(o=>!i.includes(o.id)),d=t.filter(o=>!o.is_on_time),v=x(t),l=Math.max(...v.data,0);return{notEntered:n,lateEntries:d,maxCiro:l}}function G(t){const a=x(t),e=Math.max(...a.data,0),s=new Date().toISOString().split("T")[0],i=t.filter(o=>o.date===s),d=[...new Set(i.map(o=>o.cashier_id))].length;return{maxDailyCiro:e,activeCashiers:d,avgEntryTime:"2.5dk",weeklyGrowth:"+12%"}}function O(){const t=new Date,a=t.getDay(),e=["2026-01-01","2026-04-23","2026-05-01","2026-05-19","2026-08-30","2026-10-29"],s=t.toISOString().split("T")[0];return e.includes(s)?"special":a===0||a===6?"weekend":"weekday"}async function M(){try{const t=O();console.log("Hedef tipi:",t);const{data:a,error:e}=await f.from("targets").select("amount").eq("target_type",t).single();return e?(console.error("Hedef çekme hatası:",e),{weekday:15e4,weekend:2e5,special:25e4}[t]):(console.log("Çekilen hedef:",a.amount),parseFloat(a.amount)||15e4)}catch(t){return console.error("fetchDailyTarget hatası:",t),15e4}}function H(){typeof anime>"u"||(anime({targets:".kasa-card, .sc, .total-hero-card",opacity:[0,1],translateY:[40,0],delay:anime.stagger(100),duration:800,easing:"easeOutCubic"}),anime({targets:".rank-card",opacity:[0,1],translateX:[-40,0],delay:anime.stagger(120),duration:700,easing:"easeOutCubic"}))}function P(){if(typeof anime>"u")return;const t=document.getElementById("totalDailyCiro"),a=parseFloat(t.getAttribute("data-value")||0);anime({targets:{value:0},value:a,duration:2e3,easing:"easeOutExpo",update:function(i){t.textContent=u(i.animations[0].currentValue)}});const e=document.getElementById("progressBarFill"),s=parseFloat(e.getAttribute("data-percent")||0);anime({targets:"#progressBarFill",width:s+"%",duration:1500,easing:"easeInOutQuad"})}async function q(t,a,e){const s=await M(),i=A(a),n=x(a),d=z(a),v=L(a),l=K(a,e),o=G(a),c=t.length>0?t[0]:null,y=a.length,k=a.filter(r=>r.is_on_time).length,D=y>0?Math.round(k/y*100):0,w=[...new Set(a.map(r=>r.date))].length,C=w>0?i.total/w:0,_=i.total,B=Math.min(100,Math.round(_/s*100));document.getElementById("mainContent").innerHTML=`
            <!-- HERO -->
            <div id="heroSection" class="hero ${c&&c.weekly_points>0?"gold":"blue"}">
                <div class="hero-badge">🏆 HAFTANIN ELEMANI</div>
                <div class="hero-name">${c?c.name:"Henüz Veri Yok"}</div>
                <div class="hero-amt">${c&&c.weekly_points||0} Puan</div>
                <div class="hero-sub">
                    ${c?`${c.total_entries||0} giriş · ${u(c.total_revenue||0)}`:"İlk veriyi girin!"}
                </div>
            </div>

            <!-- GÜNLÜK TOPLAM HERO KARTI -->
            <div class="section-title">💰 Rumeli İskelesi Toplam Ciro</div>
            <div class="total-hero-card">
                <div class="total-hero-left">
                    <div class="total-hero-label">Günlük Toplam Ciro</div>
                    <div class="total-hero-amount" id="totalDailyCiro" data-value="${_}">0,00 ₺</div>
                    <div class="total-hero-breakdown">
                        <span class="breakdown-item">🍽️ <span id="breakdownRestoran">${h(i.restoran)}</span></span>
                        <span class="breakdown-item">☕ <span id="breakdownCafetarya">${h(i.cafetarya)}</span></span>
                        <span class="breakdown-item">🐟 <span id="breakdownBalik">${h(i.balik)}</span></span>
                        <span class="breakdown-item">🍦 <span id="breakdownDondurma">${h(i.dondurma)}</span></span>
                    </div>
                </div>
                <div class="total-hero-right">
                    <div class="target-section">
                        <div class="target-label">📊 Günlük Hedef</div>
                        <div class="target-amount" id="targetAmount">${u(s)}</div>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" id="progressBarFill" style="width:0%" data-percent="${B}"></div>
                        </div>
                        <div class="progress-percent" id="progressPercent">${B}% Tamamlandı</div>
                    </div>
                </div>
            </div>

            <!-- TARİH FİLTRESİ -->
            <div class="date-filter-section">
                <div class="filter-label">📅 Tarih Aralığı:</div>
                <div class="filter-buttons">
                    <button class="filter-btn ${p==="week"?"active":""}" data-range="week" onclick="setDateFilter('week')">
                        Bu Hafta
                    </button>
                    <button class="filter-btn ${p==="month"?"active":""}" data-range="month" onclick="setDateFilter('month')">
                        Bu Ay
                    </button>
                    <button class="filter-btn ${p==="all"?"active":""}" data-range="all" onclick="setDateFilter('all')">
                        Tümü
                    </button>
                    <button class="filter-btn ${p==="custom"?"active":""}" data-range="custom" onclick="showCustomDatePicker()">
                        Özel Aralık ▼
                    </button>
                </div>
                <div class="filter-info" id="filterInfo">
                    ${p==="week"?"Son 7 gün":p==="month"?"Son 30 gün":p==="all"?"Tüm veriler":g?`${new Date(g).toLocaleDateString("tr-TR")} - ${new Date(E).toLocaleDateString("tr-TR")}`:"Son 7 gün"}
                </div>
            </div>

            <!-- KASİYER SIRALAMALARI -->
            <div class="section-title">👥 Kasiyer Sıralaması</div>
            <div id="rankGrid" class="rank-grid">
                ${t.slice(0,4).map((r,b)=>`
                    <div class="rank-card">
                        <div class="rank-pos p${b+1}">#${b+1}</div>
                        <div class="rank-avatar av-${N(r.name)}">${j(r.name)}</div>
                        <div class="rank-info">
                            <div class="rank-name">${r.name}</div>
                            <div class="rank-meta">
                                ${r.total_entries||0} giriş · 
                                %${r.total_entries>0?Math.round((r.on_time_entries||0)/r.total_entries*100):0} zamanında
                            </div>
                        </div>
                        <div class="rank-right">
                            <div class="rank-pts">${r.weekly_points||0}</div>
                            <div class="rank-badge-pill">${W(r.badge_level)}</div>
                        </div>
                    </div>
                `).join("")}
            </div>

            <!-- KASA BAZLI CİROLAR -->
            <div class="section-title">🏪 Kasa Bazlı Cirolar</div>
            <div class="kasa-grid">
                <div class="kasa-card restoran">
                    <div class="kasa-icon">🍽️</div>
                    <div class="kasa-label">Restoran</div>
                    <div class="kasa-amount">${u(i.restoran)}</div>
                    <div class="kasa-sub">Rumeli Z2</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.restoran/i.total*100):0} toplam</div>
                </div>
                <div class="kasa-card cafetarya">
                    <div class="kasa-icon">☕</div>
                    <div class="kasa-label">Cafetarya</div>
                    <div class="kasa-amount">${u(i.cafetarya)}</div>
                    <div class="kasa-sub">Rumeli Z1</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.cafetarya/i.total*100):0} toplam</div>
                </div>
                <div class="kasa-card balik">
                    <div class="kasa-icon">🐟</div>
                    <div class="kasa-label">Balık Ekmek</div>
                    <div class="kasa-amount">${u(i.balik)}</div>
                    <div class="kasa-sub">Z Raporu</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.balik/i.total*100):0} toplam</div>
                </div>
                <div class="kasa-card dondurma">
                    <div class="kasa-icon">🍦</div>
                    <div class="kasa-label">Dondurma</div>
                    <div class="kasa-amount">${u(i.dondurma)}</div>
                    <div class="kasa-sub">Z Raporu</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.dondurma/i.total*100):0} toplam</div>
                </div>
            </div>

            <!-- ÖZET İSTATİSTİKLER -->
            <div class="section-title">📊 Özet İstatistikler</div>
            <div class="summary-grid">
                <div class="sc blue">
                    <div class="sc-l">Bu Hafta Toplam Ciro</div>
                    <div class="sc-v">${h(i.total)}</div>
                    <div class="sc-s">${w} günlük veri</div>
                </div>
                <div class="sc purple">
                    <div class="sc-l">Günlük Ortalama</div>
                    <div class="sc-v">${h(C)}</div>
                    <div class="sc-s">Son ${w} gün</div>
                </div>
                <div class="sc orange">
                    <div class="sc-l">Zamanında Giriş</div>
                    <div class="sc-v">%${D}</div>
                    <div class="sc-s">${k}/${y} giriş</div>
                </div>
                <div class="sc green">
                    <div class="sc-l">Toplam Giriş Sayısı</div>
                    <div class="sc-v">${y}</div>
                    <div class="sc-s">Son 7 gün</div>
                </div>

                <!-- YENİ KARTLAR -->
                <div class="sc cyan">
                    <div class="sc-l">Ortalama İşlem Süresi</div>
                    <div class="sc-v" id="avgEntryTime">${o.avgEntryTime}</div>
                    <div class="sc-s">Son 7 günlük ortalama</div>
                </div>

                <div class="sc pink">
                    <div class="sc-l">En Yüksek Günlük Ciro</div>
                    <div class="sc-v" id="maxDailyCiro">${h(o.maxDailyCiro)}</div>
                    <div class="sc-s">Bu hafta rekor</div>
                </div>

                <div class="sc indigo">
                    <div class="sc-l">Aktif Kasiyer</div>
                    <div class="sc-v" id="activeCashiers">${o.activeCashiers}/${e.length}</div>
                    <div class="sc-s">Bugün giriş yapan</div>
                </div>

                <div class="sc emerald">
                    <div class="sc-l">Haftalık Büyüme</div>
                    <div class="sc-v" id="weeklyGrowth">${o.weeklyGrowth}</div>
                    <div class="sc-s">Önceki haftaya göre</div>
                </div>
            </div>

            <!-- GRAFİKLER -->
            <div class="section-title">📈 Grafikler</div>
            <div class="charts-grid">
                <div class="chart-card">
                    <div class="chart-title">📈 Günlük Ciro Trendi (Son 7 Gün)</div>
                    <div class="chart-wrap">
                        <canvas id="dailyChart"></canvas>
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-title">🥧 Kasa Dağılımı</div>
                    <div class="chart-wrap">
                        <canvas id="kasaChart"></canvas>
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-title">⚖️ Vardiya Karşılaştırması</div>
                    <div class="chart-wrap">
                        <canvas id="shiftChart"></canvas>
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-title">👥 Kasiyer Ciro Performansı</div>
                    <div class="chart-wrap">
                        <canvas id="cashierChart"></canvas>
                    </div>
                </div>
            </div>

            <!-- UYARILAR -->
            <div class="section-title">⚠️ Uyarılar</div>
            <div class="alerts-grid">
                <div class="alert-card ${l.notEntered.length>0?"danger":"ok"}">
                    <div class="alert-title">
                        ${l.notEntered.length>0?"❌":"✅"} Bugün Giriş Yapmayanlar
                    </div>
                    ${l.notEntered.length===0?'<div class="alert-item">Tüm kasiyerler giriş yaptı!</div>':l.notEntered.map(r=>`
                            <div class="alert-item">
                                <span>${r.name}</span>
                                <span style="color:var(--red)">Giriş Yok</span>
                            </div>
                        `).join("")}
                </div>
                <div class="alert-card ${l.lateEntries.length>0?"warning":"ok"}">
                    <div class="alert-title">⚠️ Geç Girişler (Bu Hafta)</div>
                    ${l.lateEntries.length===0?'<div class="alert-item">Bu hafta geç giriş yok! 🎉</div>':l.lateEntries.slice(0,5).map(r=>{var b;return`
                            <div class="alert-item">
                                <span>${((b=r.cashiers)==null?void 0:b.name)||"Bilinmiyor"}</span>
                                <span style="color:var(--orange)">${R(r.entry_time)}</span>
                            </div>
                        `}).join("")}
                </div>
                <div class="alert-card ok">
                    <div class="alert-title">📊 Haftalık Özet</div>
                    <div class="alert-item">
                        <span>En Yüksek Gün</span>
                        <span style="color:var(--green)">${u(l.maxCiro)}</span>
                    </div>
                    <div class="alert-item">
                        <span>Toplam Puan</span>
                        <span style="color:var(--orange)">${t.reduce((r,b)=>r+(b.weekly_points||0),0)}</span>
                    </div>
                    <div class="alert-item">
                        <span>Aktif Kasiyer</span>
                        <span style="color:var(--green)">${t.filter(r=>(r.total_entries||0)>0).length}/${e.length}</span>
                    </div>
                </div>
            </div>

            <!-- FİLTRE BAR -->
            <div class="filter-bar">
                <div>
                    <div style="font-size:18px;font-weight:700;">Tüm Girişler</div>
                    <div style="font-size:13px;color:var(--txt2);">${a.length} kayıt</div>
                </div>
                <div class="filter-controls">
                    <input type="date" id="filterDate" class="finput">
                    <select id="filterKasiyer" class="fsel">
                        <option value="">Tüm Kasiyerler</option>
                        ${e.map(r=>`<option value="${r.id}">${r.name}</option>`).join("")}
                    </select>
                    <select id="filterKasa" class="fsel">
                        <option value="">Tüm Kasalar</option>
                        <option value="restoran">Restoran</option>
                        <option value="cafetarya">Cafetarya</option>
                    </select>
                    <select id="filterVardiya" class="fsel">
                        <option value="">Tüm Vardiyalar</option>
                        <option value="sabah">Sabah</option>
                        <option value="aksam">Akşam</option>
                    </select>
                    <button id="applyFiltersBtn" class="fbtn">🔍 Filtrele</button>
                    <button id="clearFiltersBtn" class="fbtn" style="border-color:var(--brd);background:var(--input);color:var(--txt);">✕ Sıfırla</button>
                </div>
            </div>

            <!-- DETAYLI TABLO -->
            <div class="table-card">
                <div class="table-title">Tüm Girişler Detayı</div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Tarih</th>
                                <th>Kasiyer</th>
                                <th>Kasa</th>
                                <th>Vardiya</th>
                                <th>Giriş Saati</th>
                                <th class="r">Z Ciro</th>
                                <th class="r">Puan</th>
                                <th>Durum</th>
        <th>İşlemler</th>
                            </tr>
                        </thead>
                        <tbody id="entriesBody">
                            ${S(a)}
                        </tbody>
                    </table>
                </div>
            </div>
        `,V(n,i,d,v),document.getElementById("applyFiltersBtn").addEventListener("click",Y),document.getElementById("clearFiltersBtn").addEventListener("click",Z),document.getElementById("lastUpdate").textContent="Son güncelleme: "+new Date().toLocaleTimeString("tr-TR"),setTimeout(()=>{H(),P()},100)}let m={};function V(t,a,e,s){Chart.defaults.color="#7a8ba8",Chart.defaults.borderColor="#1e3a5f",Chart.defaults.font.family="DM Sans";const i=document.getElementById("dailyChart");i&&(m.daily&&m.daily.destroy(),m.daily=new Chart(i,{type:"bar",data:{labels:t.labels.length>0?t.labels:["Veri Yok"],datasets:[{label:"Günlük Ciro (₺)",data:t.data.length>0?t.data:[0],backgroundColor:"rgba(59,130,246,.7)",borderColor:"#3b82f6",borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:l=>"₺"+new Intl.NumberFormat("tr-TR").format(l)}}}}}));const n=document.getElementById("kasaChart");if(n){m.kasa&&m.kasa.destroy();const l=a.total>0,o=l?[a.restoran,a.cafetarya,a.balik,a.dondurma]:[.001,.001,.001,.001];m.kasa=new Chart(n,{type:"doughnut",data:{labels:["Restoran","Cafetarya","Balık Ekmek","Dondurma"],datasets:[{data:o,backgroundColor:["rgba(59,130,246,.8)","rgba(139,92,246,.8)","rgba(6,182,212,.8)","rgba(236,72,153,.8)"],borderColor:"#111d32",borderWidth:3,hoverOffset:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{position:"bottom",labels:{padding:16,usePointStyle:!0}},tooltip:{enabled:l,callbacks:{label:c=>{const y=c.raw,k=c.dataset.data.reduce((w,C)=>w+C,0),D=Math.round(y/k*100);return` ${c.label}: ${u(y)} (%${D})`}}}},cutout:"65%"}})}const d=document.getElementById("shiftChart");d&&(m.shift&&m.shift.destroy(),m.shift=new Chart(d,{type:"bar",data:{labels:["Sabah Vardiyası","Akşam Vardiyası"],datasets:[{label:"Ciro (₺)",data:[e.sabah||0,e.aksam||0],backgroundColor:["rgba(245,158,11,.7)","rgba(139,92,246,.7)"],borderColor:["#f59e0b","#8b5cf6"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:l=>"₺"+new Intl.NumberFormat("tr-TR").format(l)}}}}}));const v=document.getElementById("cashierChart");if(v){m.cashier&&m.cashier.destroy();const l=Object.keys(s),o=Object.values(s);m.cashier=new Chart(v,{type:"bar",data:{labels:l.length>0?l:["Veri Yok"],datasets:[{label:"Ciro (₺)",data:o.length>0?o:[0],backgroundColor:["rgba(139,92,246,.7)","rgba(245,158,11,.7)","rgba(236,72,153,.7)","rgba(34,197,94,.7)"],borderColor:["#8b5cf6","#f59e0b","#ec4899","#22c55e"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:c=>"₺"+new Intl.NumberFormat("tr-TR").format(c)}}}}})}}let T=[];function S(t){return t.length===0?'<tr><td colspan="9" style="text-align:center;color:var(--txt2);padding:40px;">Henüz veri yok</td></tr>':t.map(a=>{var i;const e=parseFloat(a.total_revenue||0),s=parseFloat(a.individual_revenue||e);return`
                <tr>
                    <td>${I(a.date)}</td>
                    <td style="font-weight:600">${((i=a.cashiers)==null?void 0:i.name)||"-"}</td>
                    <td><span class="badge ${a.kasa||""}">${a.kasa==="restoran"?"🍽️ Restoran":a.kasa==="cafetarya"?"☕ Cafetarya":"-"}</span></td>
                    <td><span class="badge ${a.shift||""}">${a.shift==="sabah"?"🌅 Sabah":a.shift==="aksam"?"🌙 Akşam":"-"}</span></td>
                    <td class="mono">${R(a.entry_time)}</td>
                    <td class="r">
                        <div class="mono" style="font-weight:700;color:var(--txt);">${u(s)}</div>
                        ${a.shift==="aksam"&&e!==s?`<div style="font-size:11px;color:var(--txt3);">EOD Toplam: ${u(e)}</div>`:""}
                    </td>
                    <td class="r mono" style="color:var(--orange)">${a.points_earned||0}</td>
                    <td><span class="badge ${a.is_on_time?"on-time":"late"}">${a.is_on_time?"✅":"⚠️"}</span></td>
                <td>
                    <div style="display:flex;gap:6px;">
                        <button class="action-btn edit" onclick="editEntry('${a.id}')" title="Düzenle">
                            ✏️
                        </button>
                        <button class="action-btn delete" onclick="deleteEntry('${a.id}')" title="Sil">
                            🗑️
                        </button>
                    </div>
                </td>
                </tr>
            `}).join("")}function Y(){const t=document.getElementById("filterDate").value,a=document.getElementById("filterKasiyer").value,e=document.getElementById("filterKasa").value,s=document.getElementById("filterVardiya").value;let i=[...T];t&&(i=i.filter(n=>n.date===t)),a&&(i=i.filter(n=>n.cashier_id===a)),e&&(i=i.filter(n=>n.kasa===e)),s&&(i=i.filter(n=>n.shift===s)),document.getElementById("entriesBody").innerHTML=S(i)}function Z(){document.getElementById("filterDate").value="",document.getElementById("filterKasiyer").value="",document.getElementById("filterKasa").value="",document.getElementById("filterVardiya").value="",document.getElementById("entriesBody").innerHTML=S(T)}function u(t){return new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(t||0)+" ₺"}function h(t){return t>=1e6?(t/1e6).toFixed(1)+"M ₺":t>=1e3?(t/1e3).toFixed(1)+"K ₺":u(t)}function I(t){return t?new Date(t).toLocaleDateString("tr-TR",{day:"2-digit",month:"2-digit"}):"-"}function R(t){return t?new Date(t).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"}):"-"}function j(t){return t?t.split(" ").map(a=>a[0]).join(""):"??"}function N(t){if(!t)return"t";const a=t.split(" ")[0];return{Tuba:"t",Elif:"e",Melda:"m",Ceren:"c"}[a]||"t"}function W(t){return{yeni:"🆕 Yeni",bronz:"🥉 Bronz",gumus:"🥈 Gümüş",altin:"🥇 Altın",elmas:"💎 Elmas",efsane:"👑 Efsane"}[t]||"🆕 Yeni"}window.setDateFilter=function(t){p=t,g=null,E=null,document.querySelectorAll(".filter-btn").forEach(i=>i.classList.remove("active"));const a=document.querySelector(`[data-range="${t}"]`);a&&a.classList.add("active");const e={week:"Son 7 gün",month:"Son 30 gün",all:"Tüm veriler"},s=document.getElementById("filterInfo");s&&(s.textContent=e[t]||""),window.loadDashboard()};window.showCustomDatePicker=function(){const t=document.getElementById("customDateModal"),a=new Date().toISOString().split("T")[0];if(document.getElementById("customStartDate").max=a,document.getElementById("customEndDate").max=a,g)document.getElementById("customStartDate").value=g;else{const e=new Date;e.setDate(e.getDate()-7),document.getElementById("customStartDate").value=e.toISOString().split("T")[0]}document.getElementById("customEndDate").value=E||a,t.style.display="flex"};window.closeCustomDatePicker=function(){document.getElementById("customDateModal").style.display="none"};window.applyCustomDateRange=function(){const t=document.getElementById("customStartDate").value,a=document.getElementById("customEndDate").value;if(!t||!a){alert("⚠️ Lütfen başlangıç ve bitiş tarihlerini seçin!");return}if(t>a){alert("⚠️ Başlangıç tarihi bitiş tarihinden sonra olamaz!");return}g=t,E=a,p="custom",document.querySelectorAll(".filter-btn").forEach(d=>d.classList.remove("active"));const e=document.querySelector('[data-range="custom"]');e&&e.classList.add("active");const s=new Date(t).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),i=new Date(a).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),n=document.getElementById("filterInfo");n&&(n.textContent=`${s} - ${i}`),window.closeCustomDatePicker(),window.loadDashboard()};window.loadDashboard=async function(){try{document.getElementById("mainContent").innerHTML=`
                    <div class="loading">
                        <div class="spinner"></div>
                        <div>Veriler yükleniyor...</div>
                    </div>
                `;const{weekly:t,reports:a,cashiers:e}=await F();T=a,await q(t,a,e)}catch(t){console.error("Dashboard yükleme hatası:",t),document.getElementById("mainContent").innerHTML=`
                <div class="loading">
                    <div style="font-size:48px;margin-bottom:16px;">❌</div>
                    <div style="font-size:18px;color:var(--red);">Veri yükleme hatası!</div>
                    <div style="color:var(--txt2);margin-top:8px;">${t.message}</div>
                    <button onclick="loadDashboard()" class="nb" style="margin-top:20px;">🔄 Tekrar Dene</button>
                </div>
            `}};window.loadDashboard();setInterval(()=>window.loadDashboard(),5*60*1e3);window.deleteEntry=async function(t){console.log("deleteEntry çağrıldı:",t);const a=document.createElement("div");a.className="modal-overlay",a.innerHTML=`
                <div class="modal-box">
                    <div class="modal-title">🗑️ Kaydı Sil</div>
                    <div class="modal-content">
                        <p style="color:var(--txt2);">Bu kaydı silmek istediğinize emin misiniz?</p>
                        <p style="color:var(--red);margin-top:8px;font-size:13px;">⚠️ Bu işlem geri alınamaz!</p>
                    </div>
                    <div class="modal-actions">
                        <button class="modal-btn cancel" onclick="this.closest('.modal-overlay').remove()">
                            İptal
                        </button>
                        <button class="modal-btn confirm" onclick="confirmDelete('${t}')">
                            Sil
                        </button>
                    </div>
                </div>
            `,document.body.appendChild(a)};window.confirmDelete=async function(t){const a=document.querySelector(".modal-overlay");try{console.log("Siliniyor:",t);const{data:e,error:s}=await f.from("daily_reports").delete().eq("id",t);if(console.log("Delete response:",{data:e,error:s}),s)throw new Error(s.message);a&&a.remove(),$("✅ Kayıt başarıyla silindi!","success"),await loadDashboard()}catch(e){console.error("Silme hatası:",e),$("❌ Silme başarısız: "+e.message,"error"),a&&a.remove()}};window.editEntry=async function(t){console.log("editEntry çağrıldı:",t);const{data:a,error:e}=await f.from("daily_reports").select("*").eq("id",t).single();if(e){$("❌ Kayıt bulunamadı","error");return}const s=document.createElement("div");s.className="modal-overlay",s.innerHTML=`
                <div class="modal-box" style="max-width:600px;">
                    <div class="modal-title">✏️ Kaydı Düzenle</div>
                    <div class="modal-content">
                        <div style="display:grid;gap:12px;">
                            <div>
                                <label style="font-size:12px;color:var(--txt2);display:block;margin-bottom:4px;">Z Ciro</label>
                                <input type="number" id="editZCiro" value="${parseFloat(a.rumeli_z1||0)+parseFloat(a.rumeli_z2||0)+parseFloat(a.balik_ekmek||0)+parseFloat(a.dondurma||0)}" 
                                    style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--brd);background:var(--input);color:var(--txt);">
                            </div>
                            <div>
                                <label style="font-size:12px;color:var(--txt2);display:block;margin-bottom:4px;">Puan</label>
                                <input type="number" id="editPuan" value="${a.points_earned||0}" 
                                    style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--brd);background:var(--input);color:var(--txt);">
                            </div>
                            <div>
                                <label style="font-size:12px;color:var(--txt2);display:block;margin-bottom:4px;">Durum</label>
                                <select id="editDurum" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--brd);background:var(--input);color:var(--txt);">
                                    <option value="true" ${a.is_on_time?"selected":""}>✅ Zamanında</option>
                                    <option value="false" ${a.is_on_time?"":"selected"}>⚠️ Geç</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="modal-btn cancel" onclick="this.closest('.modal-overlay').remove()">
                            İptal
                        </button>
                        <button class="modal-btn confirm" style="background:var(--acc);" onclick="confirmEdit('${t}')">
                            Kaydet
                        </button>
                    </div>
                </div>
            `,document.body.appendChild(s)};window.confirmEdit=async function(t){const a=document.querySelector(".modal-overlay");try{const e=parseFloat(document.getElementById("editZCiro").value)||0,s=parseInt(document.getElementById("editPuan").value)||0,i=document.getElementById("editDurum").value==="true";console.log("Güncelleniyor:",{entryId:t,newZCiro:e,newPuan:s,newDurum:i});const{error:n}=await f.from("daily_reports").update({total_revenue:e,points_earned:s,is_on_time:i}).eq("id",t);if(n)throw n;const{data:d}=await f.from("daily_reports").select("cashier_id").eq("id",t).single();if(!d)throw new Error("Kayıt bulunamadı");const{data:v}=await f.from("daily_reports").select("points_earned").eq("cashier_id",d.cashier_id),l=v.reduce((y,k)=>y+(parseInt(k.points_earned)||0),0);console.log("Toplam puan:",l);let o="yeni";l>=1e3?o="efsane":l>=500?o="elmas":l>=300?o="altin":l>=150?o="gumus":l>=50&&(o="bronz");const{error:c}=await f.from("cashiers").update({total_points:l,badge_level:o}).eq("id",d.cashier_id);if(c)throw c;a&&a.remove(),$("✅ Kayıt ve kasiyer puanı güncellendi!","success"),await loadDashboard()}catch(e){console.error("Güncelleme hatası:",e),$("❌ Güncelleme başarısız: "+e.message,"error"),a&&a.remove()}};function $(t,a="success"){const e=document.createElement("div");e.style.cssText=`
                position:fixed;
                bottom:20px;
                right:20px;
                background:${a==="success"?"var(--green)":"var(--red)"};
                color:#fff;
                padding:16px 20px;
                border-radius:12px;
                font-size:14px;
                font-weight:600;
                z-index:3000;
                box-shadow:0 8px 24px rgba(0,0,0,.3);
                animation:slideIn .3s;
            `,e.textContent=t,document.body.appendChild(e),setTimeout(()=>{e.style.animation="slideOut .3s",setTimeout(()=>e.remove(),300)},3e3)}
