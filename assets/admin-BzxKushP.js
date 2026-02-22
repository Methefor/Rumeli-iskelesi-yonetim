import{s as u}from"./supabase-client-DN31Znua.js";import"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";async function F(){const e=new Date,a=new Date(e);a.setDate(a.getDate()-7);const[t,s,i]=await Promise.all([u.from("weekly_performance").select("*").order("weekly_points",{ascending:!1}),u.from("daily_reports").select("*, cashiers(name)").gte("date",a.toISOString().split("T")[0]).order("date",{ascending:!1}),u.from("cashiers").select("*").order("total_points",{ascending:!1})]);return{weekly:t.data||[],reports:s.data||[],cashiers:i.data||[]}}function R(e){return e.reduce((a,t)=>(a.restoran+=parseFloat(t.rumeli_z2||0),a.cafetarya+=parseFloat(t.rumeli_z1||0),a.balik+=parseFloat(t.balik_ekmek||0),a.dondurma+=parseFloat(t.dondurma||0),a.total+=parseFloat(t.rumeli_z2||0)+parseFloat(t.rumeli_z1||0)+parseFloat(t.balik_ekmek||0)+parseFloat(t.dondurma||0),a),{restoran:0,cafetarya:0,balik:0,dondurma:0,total:0})}function T(e){const a={};e.forEach(s=>{const i=s.date;a[i]||(a[i]=0),a[i]+=parseFloat(s.rumeli_z2||0)+parseFloat(s.rumeli_z1||0)+parseFloat(s.balik_ekmek||0)+parseFloat(s.dondurma||0)});const t=Object.keys(a).sort();return{labels:t.map(s=>D(s)),data:t.map(s=>a[s])}}function S(e){const a={sabah:0,ogle:0};return e.forEach(t=>{const s=parseFloat(t.rumeli_z2||0)+parseFloat(t.rumeli_z1||0)+parseFloat(t.balik_ekmek||0)+parseFloat(t.dondurma||0);t.shift==="sabah"?a.sabah+=s:t.shift==="ogle"&&(a.ogle+=s)}),a}function I(e,a){const t={};return e.forEach(s=>{var d;const i=((d=s.cashiers)==null?void 0:d.name)||"Bilinmiyor";t[i]||(t[i]=0),t[i]+=parseFloat(s.rumeli_z2||0)+parseFloat(s.rumeli_z1||0)+parseFloat(s.balik_ekmek||0)+parseFloat(s.dondurma||0)}),t}function z(e,a){const t=new Date().toISOString().split("T")[0],s=e.filter(l=>l.date===t),i=[...new Set(s.map(l=>l.cashier_id))],d=a.filter(l=>!i.includes(l.id)),c=e.filter(l=>!l.is_on_time),p=T(e),r=Math.max(...p.data,0);return{notEntered:d,lateEntries:c,maxCiro:r}}function A(e){const a={};e.forEach(l=>{const o=l.date;a[o]||(a[o]=0),a[o]+=parseFloat(l.rumeli_z2||0)+parseFloat(l.rumeli_z1||0)+parseFloat(l.balik_ekmek||0)+parseFloat(l.dondurma||0)});const t=Math.max(...Object.values(a),0),s=new Date().toISOString().split("T")[0],i=e.filter(l=>l.date===s),c=[...new Set(i.map(l=>l.cashier_id))].length;return{maxDailyCiro:t,activeCashiers:c,avgEntryTime:"2.5dk",weeklyGrowth:"+12%"}}function K(){const e=new Date,a=e.getDay(),t=["2026-01-01","2026-04-23","2026-05-01","2026-05-19","2026-08-30","2026-10-29"],s=e.toISOString().split("T")[0];return t.includes(s)?"special":a===0||a===6?"weekend":"weekday"}async function G(){try{const e=K();console.log("Hedef tipi:",e);const{data:a,error:t}=await u.from("targets").select("amount").eq("target_type",e).single();return t?(console.error("Hedef çekme hatası:",t),{weekday:15e4,weekend:2e5,special:25e4}[e]):(console.log("Çekilen hedef:",a.amount),parseFloat(a.amount)||15e4)}catch(e){return console.error("fetchDailyTarget hatası:",e),15e4}}function L(){typeof anime>"u"||(anime({targets:".kasa-card, .sc, .total-hero-card",opacity:[0,1],translateY:[40,0],delay:anime.stagger(100),duration:800,easing:"easeOutCubic"}),anime({targets:".rank-card",opacity:[0,1],translateX:[-40,0],delay:anime.stagger(120),duration:700,easing:"easeOutCubic"}))}function M(){if(typeof anime>"u")return;const e=document.getElementById("totalDailyCiro"),a=parseFloat(e.getAttribute("data-value")||0);anime({targets:{value:0},value:a,duration:2e3,easing:"easeOutExpo",update:function(i){e.textContent=m(i.animations[0].currentValue)}});const t=document.getElementById("progressBarFill"),s=parseFloat(t.getAttribute("data-percent")||0);anime({targets:"#progressBarFill",width:s+"%",duration:1500,easing:"easeInOutQuad"})}async function O(e,a,t){const s=await G(),i=R(a),d=T(a),c=S(a),p=I(a),r=z(a,t),l=A(a),o=e.length>0?e[0]:null,y=a.length,b=a.filter(n=>n.is_on_time).length,w=y>0?Math.round(b/y*100):0,h=[...new Set(a.map(n=>n.date))].length,$=h>0?i.total/h:0,x=i.total,_=Math.min(100,Math.round(x/s*100));document.getElementById("mainContent").innerHTML=`
            <!-- HERO -->
            <div id="heroSection" class="hero ${o&&o.weekly_points>0?"gold":"blue"}">
                <div class="hero-badge">🏆 HAFTANIN ELEMANI</div>
                <div class="hero-name">${o?o.name:"Henüz Veri Yok"}</div>
                <div class="hero-amt">${o&&o.weekly_points||0} Puan</div>
                <div class="hero-sub">
                    ${o?`${o.total_entries||0} giriş · ${m(o.total_revenue||0)}`:"İlk veriyi girin!"}
                </div>
            </div>

            <!-- GÜNLÜK TOPLAM HERO KARTI -->
            <div class="section-title">💰 Rumeli İskelesi Toplam Ciro</div>
            <div class="total-hero-card">
                <div class="total-hero-left">
                    <div class="total-hero-label">Günlük Toplam Ciro</div>
                    <div class="total-hero-amount" id="totalDailyCiro" data-value="${x}">0,00 ₺</div>
                    <div class="total-hero-breakdown">
                        <span class="breakdown-item">🍽️ <span id="breakdownRestoran">${g(i.restoran)}</span></span>
                        <span class="breakdown-item">☕ <span id="breakdownCafetarya">${g(i.cafetarya)}</span></span>
                        <span class="breakdown-item">🐟 <span id="breakdownBalik">${g(i.balik)}</span></span>
                        <span class="breakdown-item">🍦 <span id="breakdownDondurma">${g(i.dondurma)}</span></span>
                    </div>
                </div>
                <div class="total-hero-right">
                    <div class="target-section">
                        <div class="target-label">📊 Günlük Hedef</div>
                        <div class="target-amount" id="targetAmount">${m(s)}</div>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" id="progressBarFill" style="width:0%" data-percent="${_}"></div>
                        </div>
                        <div class="progress-percent" id="progressPercent">${_}% Tamamlandı</div>
                    </div>
                </div>
            </div>

            <!-- KASİYER SIRALAMALARI -->
            <div class="section-title">👥 Kasiyer Sıralaması</div>
            <div id="rankGrid" class="rank-grid">
                ${e.slice(0,4).map((n,f)=>`
                    <div class="rank-card">
                        <div class="rank-pos p${f+1}">#${f+1}</div>
                        <div class="rank-avatar av-${Z(n.name)}">${Y(n.name)}</div>
                        <div class="rank-info">
                            <div class="rank-name">${n.name}</div>
                            <div class="rank-meta">
                                ${n.total_entries||0} giriş · 
                                %${n.total_entries>0?Math.round((n.on_time_entries||0)/n.total_entries*100):0} zamanında
                            </div>
                        </div>
                        <div class="rank-right">
                            <div class="rank-pts">${n.weekly_points||0}</div>
                            <div class="rank-badge-pill">${q(n.badge_level)}</div>
                        </div>
                    </div>
                `).join("")}
            </div>

            <!-- KASA BAZLI CİROLAR -->
            <div class="section-title">🏪 Kasa Bazlı Cirolar (Son 7 Gün)</div>
            <div class="kasa-grid">
                <div class="kasa-card restoran">
                    <div class="kasa-icon">🍽️</div>
                    <div class="kasa-label">Restoran</div>
                    <div class="kasa-amount">${m(i.restoran)}</div>
                    <div class="kasa-sub">Rumeli Z2</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.restoran/i.total*100):0} toplam</div>
                </div>
                <div class="kasa-card cafetarya">
                    <div class="kasa-icon">☕</div>
                    <div class="kasa-label">Cafetarya</div>
                    <div class="kasa-amount">${m(i.cafetarya)}</div>
                    <div class="kasa-sub">Rumeli Z1</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.cafetarya/i.total*100):0} toplam</div>
                </div>
                <div class="kasa-card balik">
                    <div class="kasa-icon">🐟</div>
                    <div class="kasa-label">Balık Ekmek</div>
                    <div class="kasa-amount">${m(i.balik)}</div>
                    <div class="kasa-sub">Z Raporu</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.balik/i.total*100):0} toplam</div>
                </div>
                <div class="kasa-card dondurma">
                    <div class="kasa-icon">🍦</div>
                    <div class="kasa-label">Dondurma</div>
                    <div class="kasa-amount">${m(i.dondurma)}</div>
                    <div class="kasa-sub">Z Raporu</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.dondurma/i.total*100):0} toplam</div>
                </div>
            </div>

            <!-- ÖZET İSTATİSTİKLER -->
            <div class="section-title">📊 Özet İstatistikler</div>
            <div class="summary-grid">
                <div class="sc blue">
                    <div class="sc-l">Bu Hafta Toplam Ciro</div>
                    <div class="sc-v">${g(i.total)}</div>
                    <div class="sc-s">${h} günlük veri</div>
                </div>
                <div class="sc purple">
                    <div class="sc-l">Günlük Ortalama</div>
                    <div class="sc-v">${g($)}</div>
                    <div class="sc-s">Son ${h} gün</div>
                </div>
                <div class="sc orange">
                    <div class="sc-l">Zamanında Giriş</div>
                    <div class="sc-v">%${w}</div>
                    <div class="sc-s">${b}/${y} giriş</div>
                </div>
                <div class="sc green">
                    <div class="sc-l">Toplam Giriş Sayısı</div>
                    <div class="sc-v">${y}</div>
                    <div class="sc-s">Son 7 gün</div>
                </div>

                <!-- YENİ KARTLAR -->
                <div class="sc cyan">
                    <div class="sc-l">Ortalama İşlem Süresi</div>
                    <div class="sc-v" id="avgEntryTime">${l.avgEntryTime}</div>
                    <div class="sc-s">Son 7 günlük ortalama</div>
                </div>

                <div class="sc pink">
                    <div class="sc-l">En Yüksek Günlük Ciro</div>
                    <div class="sc-v" id="maxDailyCiro">${g(l.maxDailyCiro)}</div>
                    <div class="sc-s">Bu hafta rekor</div>
                </div>

                <div class="sc indigo">
                    <div class="sc-l">Aktif Kasiyer</div>
                    <div class="sc-v" id="activeCashiers">${l.activeCashiers}/${t.length}</div>
                    <div class="sc-s">Bugün giriş yapan</div>
                </div>

                <div class="sc emerald">
                    <div class="sc-l">Haftalık Büyüme</div>
                    <div class="sc-v" id="weeklyGrowth">${l.weeklyGrowth}</div>
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
                <div class="alert-card ${r.notEntered.length>0?"danger":"ok"}">
                    <div class="alert-title">
                        ${r.notEntered.length>0?"❌":"✅"} Bugün Giriş Yapmayanlar
                    </div>
                    ${r.notEntered.length===0?'<div class="alert-item">Tüm kasiyerler giriş yaptı!</div>':r.notEntered.map(n=>`
                            <div class="alert-item">
                                <span>${n.name}</span>
                                <span style="color:var(--red)">Giriş Yok</span>
                            </div>
                        `).join("")}
                </div>
                <div class="alert-card ${r.lateEntries.length>0?"warning":"ok"}">
                    <div class="alert-title">⚠️ Geç Girişler (Bu Hafta)</div>
                    ${r.lateEntries.length===0?'<div class="alert-item">Bu hafta geç giriş yok! 🎉</div>':r.lateEntries.slice(0,5).map(n=>{var f;return`
                            <div class="alert-item">
                                <span>${((f=n.cashiers)==null?void 0:f.name)||"Bilinmiyor"}</span>
                                <span style="color:var(--orange)">${B(n.entry_time)}</span>
                            </div>
                        `}).join("")}
                </div>
                <div class="alert-card ok">
                    <div class="alert-title">📊 Haftalık Özet</div>
                    <div class="alert-item">
                        <span>En Yüksek Gün</span>
                        <span style="color:var(--green)">${m(r.maxCiro)}</span>
                    </div>
                    <div class="alert-item">
                        <span>Toplam Puan</span>
                        <span style="color:var(--orange)">${e.reduce((n,f)=>n+(f.weekly_points||0),0)}</span>
                    </div>
                    <div class="alert-item">
                        <span>Aktif Kasiyer</span>
                        <span style="color:var(--green)">${e.filter(n=>(n.total_entries||0)>0).length}/${t.length}</span>
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
                        ${t.map(n=>`<option value="${n.id}">${n.name}</option>`).join("")}
                    </select>
                    <select id="filterKasa" class="fsel">
                        <option value="">Tüm Kasalar</option>
                        <option value="restoran">Restoran</option>
                        <option value="cafetarya">Cafetarya</option>
                    </select>
                    <select id="filterVardiya" class="fsel">
                        <option value="">Tüm Vardiyalar</option>
                        <option value="sabah">Sabah</option>
                        <option value="ogle">Öğle</option>
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
                            ${E(a)}
                        </tbody>
                    </table>
                </div>
            </div>
        `,H(d,i,c,p),document.getElementById("applyFiltersBtn").addEventListener("click",P),document.getElementById("clearFiltersBtn").addEventListener("click",V),document.getElementById("lastUpdate").textContent="Son güncelleme: "+new Date().toLocaleTimeString("tr-TR"),setTimeout(()=>{L(),M()},100)}let v={};function H(e,a,t,s){Chart.defaults.color="#7a8ba8",Chart.defaults.borderColor="#1e3a5f",Chart.defaults.font.family="DM Sans";const i=document.getElementById("dailyChart");i&&(v.daily&&v.daily.destroy(),v.daily=new Chart(i,{type:"bar",data:{labels:e.labels.length>0?e.labels:["Veri Yok"],datasets:[{label:"Günlük Ciro (₺)",data:e.data.length>0?e.data:[0],backgroundColor:"rgba(59,130,246,.7)",borderColor:"#3b82f6",borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:r=>"₺"+new Intl.NumberFormat("tr-TR").format(r)}}}}}));const d=document.getElementById("kasaChart");if(d){v.kasa&&v.kasa.destroy();const r=a.total>0,l=r?[a.restoran,a.cafetarya,a.balik,a.dondurma]:[.001,.001,.001,.001];v.kasa=new Chart(d,{type:"doughnut",data:{labels:["Restoran","Cafetarya","Balık Ekmek","Dondurma"],datasets:[{data:l,backgroundColor:["rgba(59,130,246,.8)","rgba(139,92,246,.8)","rgba(6,182,212,.8)","rgba(236,72,153,.8)"],borderColor:"#111d32",borderWidth:3,hoverOffset:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{position:"bottom",labels:{padding:16,usePointStyle:!0}},tooltip:{enabled:r,callbacks:{label:o=>{const y=o.raw,b=o.dataset.data.reduce((h,$)=>h+$,0),w=Math.round(y/b*100);return` ${o.label}: ${m(y)} (%${w})`}}}},cutout:"65%"}})}const c=document.getElementById("shiftChart");c&&(v.shift&&v.shift.destroy(),v.shift=new Chart(c,{type:"bar",data:{labels:["Sabah Vardiyası","Öğle Vardiyası"],datasets:[{label:"Ciro (₺)",data:[t.sabah||0,t.ogle||0],backgroundColor:["rgba(245,158,11,.7)","rgba(139,92,246,.7)"],borderColor:["#f59e0b","#8b5cf6"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:r=>"₺"+new Intl.NumberFormat("tr-TR").format(r)}}}}}));const p=document.getElementById("cashierChart");if(p){v.cashier&&v.cashier.destroy();const r=Object.keys(s),l=Object.values(s);v.cashier=new Chart(p,{type:"bar",data:{labels:r.length>0?r:["Veri Yok"],datasets:[{label:"Ciro (₺)",data:l.length>0?l:[0],backgroundColor:["rgba(139,92,246,.7)","rgba(245,158,11,.7)","rgba(236,72,153,.7)","rgba(34,197,94,.7)"],borderColor:["#8b5cf6","#f59e0b","#ec4899","#22c55e"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:o=>"₺"+new Intl.NumberFormat("tr-TR").format(o)}}}}})}}let C=[];function E(e){return e.length===0?'<tr><td colspan="9" style="text-align:center;color:var(--txt2);padding:40px;">Henüz veri yok</td></tr>':e.map(a=>{var i;const t=parseFloat(a.total_revenue||0),s=parseFloat(a.individual_revenue||t);return`
                <tr>
                    <td>${D(a.date)}</td>
                    <td style="font-weight:600">${((i=a.cashiers)==null?void 0:i.name)||"-"}</td>
                    <td><span class="badge ${a.kasa||""}">${a.kasa==="restoran"?"🍽️ Restoran":a.kasa==="cafetarya"?"☕ Cafetarya":"-"}</span></td>
                    <td><span class="badge ${a.shift||""}">${a.shift==="sabah"?"🌅 Sabah":a.shift==="ogle"?"🌙 Öğle":"-"}</span></td>
                    <td class="mono">${B(a.entry_time)}</td>
                    <td class="r">
                        <div class="mono" style="font-weight:700;color:var(--txt);">${m(s)}</div>
                        ${a.shift==="ogle"&&t!==s?`<div style="font-size:11px;color:var(--txt3);">EOD Toplam: ${m(t)}</div>`:""}
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
            `}).join("")}function P(){const e=document.getElementById("filterDate").value,a=document.getElementById("filterKasiyer").value,t=document.getElementById("filterKasa").value,s=document.getElementById("filterVardiya").value;let i=[...C];e&&(i=i.filter(d=>d.date===e)),a&&(i=i.filter(d=>d.cashier_id===a)),t&&(i=i.filter(d=>d.kasa===t)),s&&(i=i.filter(d=>d.shift===s)),document.getElementById("entriesBody").innerHTML=E(i)}function V(){document.getElementById("filterDate").value="",document.getElementById("filterKasiyer").value="",document.getElementById("filterKasa").value="",document.getElementById("filterVardiya").value="",document.getElementById("entriesBody").innerHTML=E(C)}function m(e){return new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(e||0)+" ₺"}function g(e){return e>=1e6?(e/1e6).toFixed(1)+"M ₺":e>=1e3?(e/1e3).toFixed(1)+"K ₺":m(e)}function D(e){return e?new Date(e).toLocaleDateString("tr-TR",{day:"2-digit",month:"2-digit"}):"-"}function B(e){return e?new Date(e).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"}):"-"}function Y(e){return e?e.split(" ").map(a=>a[0]).join(""):"??"}function Z(e){if(!e)return"t";const a=e.split(" ")[0];return{Tuba:"t",Elif:"e",Melda:"m",Ceren:"c"}[a]||"t"}function q(e){return{yeni:"🆕 Yeni",bronz:"🥉 Bronz",gumus:"🥈 Gümüş",altin:"🥇 Altın",elmas:"💎 Elmas",efsane:"👑 Efsane"}[e]||"🆕 Yeni"}window.loadDashboard=async function(){try{document.getElementById("mainContent").innerHTML=`
                    <div class="loading">
                        <div class="spinner"></div>
                        <div>Veriler yükleniyor...</div>
                    </div>
                `;const{weekly:e,reports:a,cashiers:t}=await F();C=a,await O(e,a,t)}catch(e){console.error("Dashboard yükleme hatası:",e),document.getElementById("mainContent").innerHTML=`
                <div class="loading">
                    <div style="font-size:48px;margin-bottom:16px;">❌</div>
                    <div style="font-size:18px;color:var(--red);">Veri yükleme hatası!</div>
                    <div style="color:var(--txt2);margin-top:8px;">${e.message}</div>
                    <button onclick="loadDashboard()" class="nb" style="margin-top:20px;">🔄 Tekrar Dene</button>
                </div>
            `}};window.loadDashboard();setInterval(()=>window.loadDashboard(),5*60*1e3);window.deleteEntry=async function(e){console.log("deleteEntry çağrıldı:",e);const a=document.createElement("div");a.className="modal-overlay",a.innerHTML=`
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
                        <button class="modal-btn confirm" onclick="confirmDelete('${e}')">
                            Sil
                        </button>
                    </div>
                </div>
            `,document.body.appendChild(a)};window.confirmDelete=async function(e){const a=document.querySelector(".modal-overlay");try{console.log("Siliniyor:",e);const{data:t,error:s}=await u.from("daily_reports").delete().eq("id",e);if(console.log("Delete response:",{data:t,error:s}),s)throw new Error(s.message);a&&a.remove(),k("✅ Kayıt başarıyla silindi!","success"),await loadDashboard()}catch(t){console.error("Silme hatası:",t),k("❌ Silme başarısız: "+t.message,"error"),a&&a.remove()}};window.editEntry=async function(e){console.log("editEntry çağrıldı:",e);const{data:a,error:t}=await u.from("daily_reports").select("*").eq("id",e).single();if(t){k("❌ Kayıt bulunamadı","error");return}const s=document.createElement("div");s.className="modal-overlay",s.innerHTML=`
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
                        <button class="modal-btn confirm" style="background:var(--acc);" onclick="confirmEdit('${e}')">
                            Kaydet
                        </button>
                    </div>
                </div>
            `,document.body.appendChild(s)};window.confirmEdit=async function(e){const a=document.querySelector(".modal-overlay");try{const t=parseFloat(document.getElementById("editZCiro").value)||0,s=parseInt(document.getElementById("editPuan").value)||0,i=document.getElementById("editDurum").value==="true";console.log("Güncelleniyor:",{entryId:e,newZCiro:t,newPuan:s,newDurum:i});const{error:d}=await u.from("daily_reports").update({total_revenue:t,points_earned:s,is_on_time:i}).eq("id",e);if(d)throw d;const{data:c}=await u.from("daily_reports").select("cashier_id").eq("id",e).single();if(!c)throw new Error("Kayıt bulunamadı");const{data:p}=await u.from("daily_reports").select("points_earned").eq("cashier_id",c.cashier_id),r=p.reduce((y,b)=>y+(parseInt(b.points_earned)||0),0);console.log("Toplam puan:",r);let l="yeni";r>=1e3?l="efsane":r>=500?l="elmas":r>=300?l="altin":r>=150?l="gumus":r>=50&&(l="bronz");const{error:o}=await u.from("cashiers").update({total_points:r,badge_level:l}).eq("id",c.cashier_id);if(o)throw o;a&&a.remove(),k("✅ Kayıt ve kasiyer puanı güncellendi!","success"),await loadDashboard()}catch(t){console.error("Güncelleme hatası:",t),k("❌ Güncelleme başarısız: "+t.message,"error"),a&&a.remove()}};function k(e,a="success"){const t=document.createElement("div");t.style.cssText=`
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
            `,t.textContent=e,document.body.appendChild(t),setTimeout(()=>{t.style.animation="slideOut .3s",setTimeout(()=>t.remove(),300)},3e3)}
