import"./modulepreload-polyfill-B5Qt9EMX.js";import{supabase as $}from"./supabase-client-CFSZQWn8.js";import"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";let u="month",C=null,S=null,E=null;function B(a){return a.getFullYear()+"-"+String(a.getMonth()+1).padStart(2,"0")+"-"+String(a.getDate()).padStart(2,"0")}async function Z(){let a,t=null;const e=new Date;if(u==="day"&&E)a=E,t=E;else if(u==="custom"&&C&&S)a=C,t=S;else switch(u){case"week":const o=new Date;o.setDate(o.getDate()-7),a=B(o);break;case"month":a=B(new Date(e.getFullYear(),e.getMonth(),1)),t=B(new Date(e.getFullYear(),e.getMonth()+1,0));break;case"lastmonth":a=B(new Date(e.getFullYear(),e.getMonth()-1,1)),t=B(new Date(e.getFullYear(),e.getMonth(),0));break;case"all":a="2020-01-01";break;default:a=B(new Date(e.getFullYear(),e.getMonth(),1)),t=B(new Date(e.getFullYear(),e.getMonth()+1,0))}let s=$.from("daily_reports").select("*, cashiers(name)").gte("date",a).order("date",{ascending:!1});t&&(s=s.lte("date",t));const[i,n]=await Promise.all([s,$.from("cashiers").select("*").order("total_points",{ascending:!1})]);return{weekly:[],reports:i.data||[],cashiers:n.data||[]}}function W(a){const t={};return a.forEach(e=>{const s=`${e.date}-${e.kasa}`;(!t[s]||e.shift==="aksam")&&(t[s]=e)}),Object.values(t).reduce((e,s)=>(e.restoran+=parseFloat(s.rumeli_z2||0),e.cafetarya+=parseFloat(s.rumeli_z1||0),e.balik+=parseFloat(s.balik_ekmek||0),e.dondurma+=parseFloat(s.dondurma||0),e.total+=parseFloat(s.rumeli_z2||0)+parseFloat(s.rumeli_z1||0)+parseFloat(s.balik_ekmek||0)+parseFloat(s.dondurma||0),e),{restoran:0,cafetarya:0,balik:0,dondurma:0,total:0})}function L(a){const t={};a.forEach(i=>{const n=`${i.date}-${i.kasa}`;(!t[n]||i.shift==="aksam")&&(t[n]=i)});const e={};Object.values(t).forEach(i=>{const n=i.date;e[n]||(e[n]=0),e[n]+=parseFloat(i.rumeli_z2||0)+parseFloat(i.rumeli_z1||0)+parseFloat(i.balik_ekmek||0)+parseFloat(i.dondurma||0)});const s=Object.keys(e).sort();return{labels:s.map(i=>H(i)),data:s.map(i=>e[i])}}function U(a){const t={};a.forEach(s=>{const i=`${s.date}-${s.kasa}`;(!t[i]||s.shift==="aksam")&&(t[i]=s)});const e={sabah:0,aksam:0};return Object.values(t).forEach(s=>{const i=parseFloat(s.rumeli_z2||0)+parseFloat(s.rumeli_z1||0)+parseFloat(s.balik_ekmek||0)+parseFloat(s.dondurma||0);s.shift==="sabah"?e.sabah+=i:s.shift==="aksam"&&(e.aksam+=i)}),e}function Q(a,t){const e={};return a.forEach(s=>{var n;const i=((n=s.cashiers)==null?void 0:n.name)||"Bilinmiyor";e[i]||(e[i]=0),e[i]+=parseFloat(s.individual_revenue||0)}),e}function J(a,t){const e=new Date().toISOString().split("T")[0],s=a.filter(m=>m.date===e),i=[...new Set(s.map(m=>m.cashier_id))],n=t.filter(m=>!i.includes(m.id)),o=a.filter(m=>!m.is_on_time),y=L(a),d=Math.max(...y.data,0);return{notEntered:n,lateEntries:o,maxCiro:d}}function X(a){const t=L(a),e=Math.max(...t.data,0),s=new Date().toISOString().split("T")[0],i=a.filter(m=>m.date===s),o=[...new Set(i.map(m=>m.cashier_id))].length;return{maxDailyCiro:e,activeCashiers:o,avgEntryTime:"2.5dk",weeklyGrowth:"+12%"}}function tt(){const a=new Date,t=a.getDay(),e=["2026-01-01","2026-04-23","2026-05-01","2026-05-19","2026-08-30","2026-10-29"],s=a.toISOString().split("T")[0];return e.includes(s)?"special":t===0||t===6?"weekend":"weekday"}async function at(){try{const a=tt();console.log("Hedef tipi:",a);const{data:t,error:e}=await $.from("targets").select("amount").eq("target_type",a).single();return e?(console.error("Hedef çekme hatası:",e),{weekday:15e4,weekend:2e5,special:25e4}[a]):(console.log("Çekilen hedef:",t.amount),parseFloat(t.amount)||15e4)}catch(a){return console.error("fetchDailyTarget hatası:",a),15e4}}function et(){typeof anime>"u"||(anime({targets:".kasa-card, .sc, .total-hero-card",opacity:[0,1],translateY:[40,0],delay:anime.stagger(100),duration:800,easing:"easeOutCubic"}),anime({targets:".rank-card",opacity:[0,1],translateX:[-40,0],delay:anime.stagger(120),duration:700,easing:"easeOutCubic"}))}function it(){if(typeof anime>"u")return;const a=document.getElementById("totalDailyCiro"),t=parseFloat(a.getAttribute("data-value")||0);anime({targets:{value:0},value:t,duration:2e3,easing:"easeOutExpo",update:function(i){a.textContent=v(i.animations[0].currentValue)}});const e=document.getElementById("progressBarFill"),s=parseFloat(e.getAttribute("data-percent")||0);anime({targets:"#progressBarFill",width:s+"%",duration:1500,easing:"easeInOutQuad"})}function st(a){const t={gida:{name:"Gıda",icon:"🥗",total:0,color:"#22c55e"},kahvalti:{name:"Kahvaltı",icon:"🥐",total:0,color:"#f59e0b"},kahve:{name:"Kahve",icon:"☕",total:0,color:"#8b5cf6"},meyvesuyu:{name:"Meyve Suyu",icon:"🧃",total:0,color:"#ec4899"},sicak_icecek:{name:"Sıcak İçecek",icon:"🔥",total:0,color:"#ef4444"},soguk_icecek:{name:"Soğuk İçecek",icon:"🥤",total:0,color:"#3b82f6"},tatli:{name:"Tatlı",icon:"🍰",total:0,color:"#a855f7"}},e={};a.forEach(n=>{const o=`${n.date}-${n.kasa}`;(!e[o]||n.shift==="aksam")&&(e[o]=n)}),Object.values(e).forEach(n=>{t.gida.total+=parseFloat(n.gida)||0,t.kahvalti.total+=parseFloat(n.kahvalti)||0,t.kahve.total+=parseFloat(n.kahve)||0,t.meyvesuyu.total+=parseFloat(n.meyvesuyu)||0,t.sicak_icecek.total+=parseFloat(n.sicak_icecek)||0,t.soguk_icecek.total+=parseFloat(n.soguk_icecek)||0,t.tatli.total+=parseFloat(n.tatli)||0});const s=Object.values(t).reduce((n,o)=>n+o.total,0);Object.values(t).forEach(n=>{n.percentage=s>0?n.total/s*100:0});const i=Object.entries(t).map(([n,o])=>({key:n,...o})).sort((n,o)=>o.total-n.total);return{categories:i,total:s,highest:i[0],lowest:i[i.length-1],average:s/i.length}}function nt(a){return a.categories.map(t=>`
                <div class="category-card">
                    <div class="category-header">
                        <span class="category-icon">${t.icon}</span>
                        <span class="category-name">${t.name}</span>
                    </div>
                    <div class="category-amount">${v(t.total)}</div>
                    <div class="category-stats">
                        <span class="category-percentage">${t.percentage.toFixed(1)}% pay</span>
                    </div>
                </div>
            `).join("")}function ot(a){var e;const t=((e=a.categories[0])==null?void 0:e.total)||1;return a.categories.map(s=>{const i=t>0?s.total/t*100:0;return`
                    <div class="category-bar">
                        <div class="category-bar-label">${s.icon} ${s.name}</div>
                        <div class="category-bar-track">
                            <div class="category-bar-fill" style="width:${i}%;background:${s.color};">
                                ${z(s.total)}
                            </div>
                        </div>
                    </div>
                `}).join("")}function lt(a){return`
                <div class="category-summary-card">
                    <div class="summary-icon">🏆</div>
                    <div class="summary-label">En Çok Satan</div>
                    <div class="summary-value">${a.highest.icon} ${a.highest.name}</div>
                    <div style="font-size:12px;color:var(--acc);margin-top:4px;font-weight:600;">${z(a.highest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📉</div>
                    <div class="summary-label">En Az Satan</div>
                    <div class="summary-value">${a.lowest.icon} ${a.lowest.name}</div>
                    <div style="font-size:12px;color:var(--txt3);margin-top:4px;font-weight:600;">${z(a.lowest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📊</div>
                    <div class="summary-label">Kategori Ort.</div>
                    <div class="summary-value">${z(a.average)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">Kategori başına</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">💰</div>
                    <div class="summary-label">Kategori Toplamı</div>
                    <div class="summary-value">${z(a.total)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">7 kategori</div>
                </div>
            `}async function rt(a,t,e){const s=await at(),i=W(t),n=L(t),o=U(t),y=Q(t),d=J(t,e),m=X(t),p=st(t),h={};t.forEach(r=>{var R;const g=r.cashier_id,A=((R=r.cashiers)==null?void 0:R.name)||"Bilinmiyor";h[g]||(h[g]={name:A,points:0,entries:0,revenue:0}),h[g].points+=parseInt(r.points_earned)||0,h[g].entries+=1,h[g].revenue+=parseFloat(r.individual_revenue)||0});const f=Object.values(h).sort((r,g)=>g.points-r.points),b=f.length>0?f[0]:null,D=t.length,x=t.filter(r=>r.is_on_time).length,I=D>0?Math.round(x/D*100):0,k=[...new Set(t.map(r=>r.date))].length,F=k>0?i.total/k:0,l=i.total,c=u==="day"&&E?E:new Date().toISOString().split("T")[0],T={};t.filter(r=>r.date===c).forEach(r=>{const g=`${r.date}-${r.kasa}`;(!T[g]||r.shift==="aksam")&&(T[g]=r)});const O=Object.values(T).reduce((r,g)=>r+parseFloat(g.total_revenue||0),0),K=s>0?Math.min(100,Math.round(O/s*100)):0;document.getElementById("mainContent").innerHTML=`

            <!-- TARİH FİLTRESİ -->
            <div class="date-filter-section">
                <div class="filter-label">📅 Tarih Aralığı:</div>
                <div class="filter-buttons">
                    <button class="filter-btn ${u==="month"?"active":""}" data-range="month" onclick="setDateFilter('month')">Bu Ay</button>
                    <button class="filter-btn ${u==="lastmonth"?"active":""}" data-range="lastmonth" onclick="setDateFilter('lastmonth')">Geçen Ay</button>
                    <button class="filter-btn ${u==="week"?"active":""}" data-range="week" onclick="setDateFilter('week')">Bu Hafta</button>
                    <button class="filter-btn ${u==="all"?"active":""}" data-range="all" onclick="setDateFilter('all')">Tümü</button>
                    <button class="filter-btn ${u==="day"?"active":""}" data-range="day" onclick="showDayPicker()">📅 Belirli Gün</button>
                    <button class="filter-btn ${u==="custom"?"active":""}" data-range="custom" onclick="showCustomDatePicker()">Özel Aralık ▼</button>
                </div>
                <div class="filter-info" id="filterInfo">
                    ${u==="week"?"Son 7 gün":u==="month"?`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`:u==="lastmonth"?`Geçen Ay (${new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`:u==="all"?"Tüm veriler":u==="day"&&E?new Date(E).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}):C?`${new Date(C).toLocaleDateString("tr-TR")} - ${new Date(S).toLocaleDateString("tr-TR")}`:`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`}
                </div>
            </div>

            <!-- GÜNLÜK TOPLAM HERO KARTI -->
            <div class="section-title">💰 Rumeli İskelesi Toplam Ciro</div>
            <div class="total-hero-card">
                <div class="total-hero-left">
                    <div class="total-hero-label">${u==="month"?"Bu Ay Toplam Ciro":u==="week"?"Bu Hafta Toplam Ciro":u==="day"?"Günlük Toplam Ciro":"Dönem Toplam Ciro"}</div>
                    <div class="total-hero-amount" id="totalDailyCiro" data-value="${l}">0,00 ₺</div>
                    <div class="total-hero-breakdown">
                        <span class="breakdown-item">🍽️ <span id="breakdownRestoran">${v(i.restoran)}</span></span>
                        <span class="breakdown-item">☕ <span id="breakdownCafetarya">${v(i.cafetarya)}</span></span>
                        <span class="breakdown-item">🐟 <span id="breakdownBalik">${v(i.balik)}</span></span>
                        <span class="breakdown-item">🍦 <span id="breakdownDondurma">${v(i.dondurma)}</span></span>
                    </div>
                </div>
                <div class="total-hero-right">
                    <div class="target-section">
                        <div class="target-label">📊 Rumeli İskelesi (Rest.+Cafe)</div>
                        <div class="target-amount">${v(i.restoran+i.cafetarya)}</div>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" id="progressBarFill" style="width:0%" data-percent="${K}"></div>
                        </div>
                        <div class="progress-percent" id="progressPercent">Günlük Ort: ${v(k>0?(i.restoran+i.cafetarya)/k:0)}</div>
                    </div>
                </div>
            </div>

            <!-- KASA BAZLI CİROLAR -->
            <div class="section-title">🏪 Kasa Bazlı Cirolar</div>
            <div class="kasa-grid">
                <div class="kasa-card restoran" style="animation: kasaPop .5s ease .0s both;">
                    <div class="kasa-icon">🍽️</div>
                    <div class="kasa-label">Restoran</div>
                    <div class="kasa-amount" data-target="${i.restoran}">0,00 ₺</div>
                    <div class="kasa-sub">Rumeli Z2</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.restoran/i.total*100):0} toplam</div>
                </div>
                <div class="kasa-card cafetarya" style="animation: kasaPop .5s ease .1s both;">
                    <div class="kasa-icon">☕</div>
                    <div class="kasa-label">Cafetarya</div>
                    <div class="kasa-amount" data-target="${i.cafetarya}">0,00 ₺</div>
                    <div class="kasa-sub">Rumeli Z1</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.cafetarya/i.total*100):0} toplam</div>
                </div>
                <div class="kasa-card balik" style="animation: kasaPop .5s ease .2s both;">
                    <div class="kasa-icon">🐟</div>
                    <div class="kasa-label">Balık Ekmek</div>
                    <div class="kasa-amount" data-target="${i.balik}">0,00 ₺</div>
                    <div class="kasa-sub">Z Raporu</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.balik/i.total*100):0} toplam</div>
                </div>
                <div class="kasa-card dondurma" style="animation: kasaPop .5s ease .3s both;">
                    <div class="kasa-icon">🍦</div>
                    <div class="kasa-label">Dondurma</div>
                    <div class="kasa-amount" data-target="${i.dondurma}">0,00 ₺</div>
                    <div class="kasa-sub">Z Raporu</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.dondurma/i.total*100):0} toplam</div>
                </div>
            </div>

            <!-- ÖZET İSTATİSTİKLER -->
            <div class="section-title">📊 Özet İstatistikler</div>
            <div class="summary-grid">
                <div class="sc blue">
                    <div class="sc-l">${u==="month"?"Bu Ay Toplam Ciro":u==="week"?"Bu Hafta Toplam Ciro":u==="day"?"Günlük Toplam Ciro":"Dönem Toplam Ciro"}</div>
                    <div class="sc-v">${v(i.total)}</div>
                    <div class="sc-s">${k} günlük veri</div>
                </div>
                <div class="sc purple">
                    <div class="sc-l">Günlük Ortalama (Tüm)</div>
                    <div class="sc-v">${v(F)}</div>
                    <div class="sc-s">Son ${k} gün</div>
                </div>
                <div class="sc emerald">
                    <div class="sc-l">🏢 Rumeli İskelesi Toplam</div>
                    <div class="sc-v">${v(i.restoran+i.cafetarya)}</div>
                    <div class="sc-s">Restoran + Cafetarya</div>
                </div>
                <div class="sc cyan">
                    <div class="sc-l">🏢 Rumeli İskelesi Günlük Ort.</div>
                    <div class="sc-v">${v(k>0?(i.restoran+i.cafetarya)/k:0)}</div>
                    <div class="sc-s">${k} günlük ortalama</div>
                </div>
                <div class="sc orange">
                    <div class="sc-l">Zamanında Giriş</div>
                    <div class="sc-v">%${I}</div>
                    <div class="sc-s">${x}/${D} giriş</div>
                </div>
                <div class="sc green">
                    <div class="sc-l">Toplam Giriş Sayısı</div>
                    <div class="sc-v">${D}</div>
                    <div class="sc-s">${k} günlük</div>
                </div>
                <div class="sc pink">
                    <div class="sc-l">En Yüksek Günlük Ciro</div>
                    <div class="sc-v" id="maxDailyCiro">${v(m.maxDailyCiro)}</div>
                    <div class="sc-s">Dönem rekoru</div>
                </div>
                <div class="sc indigo">
                    <div class="sc-l">Aktif Kasiyer</div>
                    <div class="sc-v" id="activeCashiers">${m.activeCashiers}/${e.length}</div>
                    <div class="sc-s">Bugün giriş yapan</div>
                </div>
            </div>

            <!-- KATEGORİ SATIŞ ANALİZİ -->
            <div class="section-title">🏷️ Kategori Bazlı Satış Analizi</div>

            <!-- Kategori Kartları -->
            <div class="category-cards-grid">
                ${nt(p)}
            </div>

            <!-- Kategori Grafikler + Özet -->
            <div class="category-charts">
                <div class="category-chart-box">
                    <div class="chart-title">📊 Kategori Karşılaştırması</div>
                    ${ot(p)}
                </div>
                <div class="category-chart-box">
                    <div class="chart-title">📋 Özet İstatistikler</div>
                    <div class="category-summary">
                        ${lt(p)}
                    </div>
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
                <div class="alert-card ${d.notEntered.length>0?"danger":"ok"}">
                    <div class="alert-title">
                        ${d.notEntered.length>0?"❌":"✅"} Bugün Giriş Yapmayanlar
                    </div>
                    ${d.notEntered.length===0?'<div class="alert-item">Tüm kasiyerler giriş yaptı!</div>':d.notEntered.map(r=>`
                            <div class="alert-item">
                                <span>${r.name}</span>
                                <span style="color:var(--red)">Giriş Yok</span>
                            </div>
                        `).join("")}
                </div>
                <div class="alert-card ${d.lateEntries.length>0?"warning":"ok"}">
                    <div class="alert-title">⚠️ Geç Girişler (Bu Hafta)</div>
                    ${d.lateEntries.length===0?'<div class="alert-item">Bu hafta geç giriş yok! 🎉</div>':d.lateEntries.slice(0,5).map(r=>{var g;return`
                            <div class="alert-item">
                                <span>${((g=r.cashiers)==null?void 0:g.name)||"Bilinmiyor"}</span>
                                <span style="color:var(--orange)">${V(r.entry_time)}</span>
                            </div>
                        `}).join("")}
                </div>
                <div class="alert-card ok">
                    <div class="alert-title">📊 Haftalık Özet</div>
                    <div class="alert-item">
                        <span>En Yüksek Gün</span>
                        <span style="color:var(--green)">${v(d.maxCiro)}</span>
                    </div>
                    <div class="alert-item">
                        <span>Toplam Puan</span>
                        <span style="color:var(--orange)">${a.reduce((r,g)=>r+(g.weekly_points||0),0)}</span>
                    </div>
                    <div class="alert-item">
                        <span>Aktif Kasiyer</span>
                        <span style="color:var(--green)">${a.filter(r=>(r.total_entries||0)>0).length}/${e.length}</span>
                    </div>
                </div>
            </div>

            <!-- DETAYLI VERİLER TOGGLE -->
            <div class="details-toggle-section">
                <button class="details-toggle-btn" onclick="toggleDetails()">
                    <span id="toggleIcon">👁️</span>
                    <span id="toggleText">Detaylı Verileri Göster</span>
                </button>
            </div>

            <div id="detailedSection" style="display:none;" class="detailed-section">
                <!-- FİLTRE BAR -->
                <div class="filter-bar">
                    <div>
                        <div style="font-size:18px;font-weight:700;">Tüm Girişler</div>
                        <div style="font-size:13px;color:var(--txt2);">${t.length} kayıt</div>
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
                                ${G(t)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- KASİYER SIRALAMALARI -->
            <div class="section-title" style="margin-top:40px;">👥 Kasiyer Sıralaması <span style="font-size:13px;font-weight:500;color:var(--txt2);">(Bu Ay)</span></div>
            <div id="rankGrid" class="rank-grid">
                ${f.map((r,g)=>{const A=e.find(N=>(N.name||"")===r.name)||{},R=A.id||"",q=j(A.badge_level);return`
                    <div class="rank-card">
                        <div class="rank-pos p${Math.min(g+1,4)}">#${g+1}</div>
                        <div class="rank-avatar av-${yt(r.name)}">${gt(r.name)}</div>
                        <div class="rank-info">
                            <div class="rank-name">${r.name}</div>
                            <div class="rank-meta">
                                ${r.entries} giriş · ${v(r.revenue)} ciro
                            </div>
                        </div>
                        <div class="rank-right">
                            <div class="rank-pts">${r.points} puan</div>
                            <div class="rank-badge-pill">${q}</div>
                            ${R?`<button class="badge-assign-btn" onclick="assignBadge('${R}','${r.name}')">🎖️ Rozet Ver</button>`:""}
                        </div>
                    </div>`}).join("")}
            </div>

            <!-- AYIN ELEMANI HERO -->
            <div id="heroSection" class="hero ${b&&b.points>0?"gold":"blue"}" style="margin-top:24px;">
                <div class="hero-badge">🏆 AYIN ELEMANI</div>
                <div class="hero-name">${b?b.name:"Henüz Veri Yok"}</div>
                <div class="hero-amt">${b?b.points:0} Puan</div>
                <div class="hero-sub">
                    ${b?`${b.entries} giriş · ${v(b.revenue)}`:"İlk veriyi girin!"}
                </div>
            </div>
        `,dt(n,i,o,y);const P=document.getElementById("applyFiltersBtn"),Y=document.getElementById("clearFiltersBtn");P&&P.addEventListener("click",ct),Y&&Y.addEventListener("click",vt),document.getElementById("lastUpdate").textContent="Son güncelleme: "+new Date().toLocaleTimeString("tr-TR"),setTimeout(()=>{et(),it(),mt()},100),ut(s,O,K)}let w={};function dt(a,t,e,s){Chart.defaults.color="#7a8ba8",Chart.defaults.borderColor="#1e3a5f",Chart.defaults.font.family="DM Sans";const i=document.getElementById("dailyChart");i&&(w.daily&&w.daily.destroy(),w.daily=new Chart(i,{type:"bar",data:{labels:a.labels.length>0?a.labels:["Veri Yok"],datasets:[{label:"Günlük Ciro (₺)",data:a.data.length>0?a.data:[0],backgroundColor:"rgba(59,130,246,.7)",borderColor:"#3b82f6",borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:d=>"₺"+new Intl.NumberFormat("tr-TR").format(d)}}}}}));const n=document.getElementById("kasaChart");if(n){w.kasa&&w.kasa.destroy();const d=t.total>0,m=d?[t.restoran,t.cafetarya,t.balik,t.dondurma]:[.001,.001,.001,.001];w.kasa=new Chart(n,{type:"doughnut",data:{labels:["Restoran","Cafetarya","Balık Ekmek","Dondurma"],datasets:[{data:m,backgroundColor:["rgba(59,130,246,.8)","rgba(139,92,246,.8)","rgba(6,182,212,.8)","rgba(236,72,153,.8)"],borderColor:"#111d32",borderWidth:3,hoverOffset:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{position:"bottom",labels:{padding:16,usePointStyle:!0}},tooltip:{enabled:d,callbacks:{label:p=>{const h=p.raw,f=p.dataset.data.reduce((D,x)=>D+x,0),b=Math.round(h/f*100);return` ${p.label}: ${v(h)} (%${b})`}}}},cutout:"65%"}})}const o=document.getElementById("shiftChart");o&&(w.shift&&w.shift.destroy(),w.shift=new Chart(o,{type:"bar",data:{labels:["Sabah Vardiyası","Akşam Vardiyası"],datasets:[{label:"Ciro (₺)",data:[e.sabah||0,e.aksam||0],backgroundColor:["rgba(245,158,11,.7)","rgba(139,92,246,.7)"],borderColor:["#f59e0b","#8b5cf6"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:d=>"₺"+new Intl.NumberFormat("tr-TR").format(d)}}}}}));const y=document.getElementById("cashierChart");if(y){w.cashier&&w.cashier.destroy();const d=Object.keys(s),m=Object.values(s);w.cashier=new Chart(y,{type:"bar",data:{labels:d.length>0?d:["Veri Yok"],datasets:[{label:"Ciro (₺)",data:m.length>0?m:[0],backgroundColor:["rgba(139,92,246,.7)","rgba(245,158,11,.7)","rgba(236,72,153,.7)","rgba(34,197,94,.7)"],borderColor:["#8b5cf6","#f59e0b","#ec4899","#22c55e"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:p=>"₺"+new Intl.NumberFormat("tr-TR").format(p)}}}}})}}let M=[];function G(a){return a.length===0?'<tr><td colspan="9" style="text-align:center;color:var(--txt2);padding:40px;">Henüz veri yok</td></tr>':a.map(t=>{var i;const e=parseFloat(t.total_revenue||0),s=parseFloat(t.individual_revenue||e);return`
                <tr>
                    <td>${H(t.date)}</td>
                    <td style="font-weight:600">${((i=t.cashiers)==null?void 0:i.name)||"-"}</td>
                    <td><span class="badge ${t.kasa||""}">${t.kasa==="restoran"?"🍽️ Restoran":t.kasa==="cafetarya"?"☕ Cafetarya":"-"}</span></td>
                    <td><span class="badge ${t.shift||""}">${t.shift==="sabah"?"🌅 Sabah":t.shift==="aksam"?"🌙 Akşam":"-"}</span></td>
                    <td class="mono">${V(t.entry_time)}</td>
                    <td class="r">
                        <div class="mono" style="font-weight:700;color:var(--txt);">${v(s)}</div>
                        ${t.shift==="aksam"&&e!==s?`<div style="font-size:11px;color:var(--txt3);">EOD Toplam: ${v(e)}</div>`:""}
                    </td>
                    <td class="r mono" style="color:var(--orange)">${t.points_earned||0}</td>
                    <td><span class="badge ${t.is_on_time?"on-time":"late"}">${t.is_on_time?"✅":"⚠️"}</span></td>
                <td>
                    <div style="display:flex;gap:6px;">
                        <button class="action-btn edit" onclick="editEntry('${t.id}')" title="Düzenle">
                            ✏️
                        </button>
                        <button class="action-btn delete" onclick="deleteEntry('${t.id}')" title="Sil">
                            🗑️
                        </button>
                    </div>
                </td>
                </tr>
            `}).join("")}function ct(){const a=document.getElementById("filterDate").value,t=document.getElementById("filterKasiyer").value,e=document.getElementById("filterKasa").value,s=document.getElementById("filterVardiya").value;let i=[...M];a&&(i=i.filter(n=>n.date===a)),t&&(i=i.filter(n=>n.cashier_id===t)),e&&(i=i.filter(n=>n.kasa===e)),s&&(i=i.filter(n=>n.shift===s)),document.getElementById("entriesBody").innerHTML=G(i)}function vt(){document.getElementById("filterDate").value="",document.getElementById("filterKasiyer").value="",document.getElementById("filterKasa").value="",document.getElementById("filterVardiya").value="",document.getElementById("entriesBody").innerHTML=G(M)}function v(a){return new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(a||0)+" ₺"}function z(a){return v(a)}function mt(){document.querySelectorAll(".kasa-amount[data-target]").forEach(a=>{const t=parseFloat(a.dataset.target)||0,e=1200,s=performance.now();function i(n){const o=Math.min((n-s)/e,1),y=1-Math.pow(1-o,3);a.textContent=v(t*y),o<1?requestAnimationFrame(i):a.textContent=v(t)}requestAnimationFrame(i)})}function ut(a,t,e){const s=document.getElementById("floatingTarget");if(!s)return;s.style.display="block",document.getElementById("ftPct").textContent=e+"%",document.getElementById("ftTarget").textContent=v(a),document.getElementById("ftCurrent").textContent=v(t);const i=[[100,"🎉 Hedef Tamamlandı!"],[80,"💪 Hedefe Yakın!"],[50,"⏰ Yarı Yolda!"],[0,"🚀 Devam Edelim!"]];document.getElementById("ftStatus").textContent=(i.find(([o])=>e>=o)||i[3])[1];const n=document.getElementById("ftBar");n.classList.toggle("done",e>=100),n.classList.toggle("near",e>=80&&e<100),setTimeout(()=>{n.style.width=Math.min(100,e)+"%"},200)}window.showVerimlilik=async function(){document.getElementById("verimlilikModal").style.display="flex";const a=document.getElementById("verimlilikBody");a.innerHTML='<div class="loading" style="padding:40px 0;"><div class="spinner"></div><div>Veriler hesaplanıyor...</div></div>';try{const t=new Date,e=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-01`,s=new Date(t.getFullYear(),t.getMonth()+1,0).getDate(),i=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${s}`,{data:n}=await $.from("daily_reports").select("date, kasa, shift, total_revenue").in("kasa",["restoran","cafetarya"]).gte("date",e).lte("date",i).order("date",{ascending:!0});if(!n||n.length===0){a.innerHTML='<div style="text-align:center;padding:40px;color:var(--txt2);">Bu ay için veri bulunamadı.</div>';return}const o={};n.forEach(l=>{o[l.date]||(o[l.date]={restoran:0,cafetarya:0}),o[l.date][l.kasa]=Math.max(o[l.date][l.kasa]||0,parseFloat(l.total_revenue)||0)});const y={};n.forEach(l=>{const c=`${l.date}-${l.kasa}`;(!y[c]||l.shift==="aksam")&&(y[c]=parseFloat(l.total_revenue)||0)}),Object.keys(y).forEach(l=>{const[c,T]=l.split("-");o[c]||(o[c]={restoran:0,cafetarya:0}),o[c][T]=y[l]});const d=Object.entries(o).map(([l,c])=>({date:l,total:(c.restoran||0)+(c.cafetarya||0),restoran:c.restoran||0,cafetarya:c.cafetarya||0})).sort((l,c)=>l.date.localeCompare(c.date)),m=d.reduce((l,c)=>l+c.total,0),p=d.length,h=p>0?m/p:0,f=d.reduce((l,c)=>c.total>l.total?c:l,d[0]),b=["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"],D={},x={};d.forEach(l=>{const c=new Date(l.date).getDay();D[c]=(D[c]||0)+l.total,x[c]=(x[c]||0)+1});const I=[0,1,2,3,4,5,6].filter(l=>x[l]).map(l=>({name:b[l],avg:D[l]/x[l],idx:l})).sort((l,c)=>c.avg-l.avg),k=I.length>0?I[0].avg:1,F=t.toLocaleDateString("tr-TR",{month:"long",year:"numeric"});a.innerHTML=`
                    <div class="ver-stats-grid">
                        <div class="ver-stat-card">
                            <div class="ver-stat-label">🏢 Rumeli İskelesi Toplam</div>
                            <div class="ver-stat-value">${v(m)}</div>
                            <div class="ver-stat-sub">${F}</div>
                        </div>
                        <div class="ver-stat-card">
                            <div class="ver-stat-label">📅 Veri Günü</div>
                            <div class="ver-stat-value">${p} gün</div>
                            <div class="ver-stat-sub">Girişi olan günler</div>
                        </div>
                        <div class="ver-stat-card">
                            <div class="ver-stat-label">📊 Günlük Ortalama</div>
                            <div class="ver-stat-value">${v(h)}</div>
                            <div class="ver-stat-sub">Rest.+Cafe ortalaması</div>
                        </div>
                        <div class="ver-stat-card" style="border-color:var(--orange);">
                            <div class="ver-stat-label">🏆 En İyi Gün</div>
                            <div class="ver-stat-value">${v((f==null?void 0:f.total)||0)}</div>
                            <div class="ver-stat-sub">${f?new Date(f.date).toLocaleDateString("tr-TR",{day:"numeric",month:"long",weekday:"short"}):"-"}</div>
                        </div>
                    </div>

                    <div class="ver-section-title">📈 Haftanın En İyi Günleri (Ortalamaya Göre)</div>
                    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px;">
                        ${I.map((l,c)=>`
                            <div style="display:flex;align-items:center;gap:12px;">
                                <div style="width:20px;text-align:right;font-size:12px;color:var(--txt2);">${c+1}.</div>
                                <div style="width:90px;font-size:13px;font-weight:600;">${l.name}</div>
                                <div style="flex:1;height:8px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;">
                                    <div style="height:100%;width:${Math.round(l.avg/k*100)}%;background:linear-gradient(90deg,${c===0?"#f59e0b,#f97316":"#3b82f6,#06b6d4"});border-radius:4px;transition:width 1s ease;"></div>
                                </div>
                                <div style="width:130px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;color:${c===0?"var(--orange)":"var(--txt)"};">${v(l.avg)}</div>
                            </div>
                        `).join("")}
                    </div>

                    <div class="ver-section-title">📋 Günlük Ciro Detayı — ${F}</div>
                    <div style="max-height:320px;overflow-y:auto;border-radius:10px;border:1px solid var(--brd);">
                        <table class="ver-daily-table">
                            <thead>
                                <tr>
                                    <th>Tarih</th>
                                    <th>Gün</th>
                                    <th>Restoran</th>
                                    <th>Cafetarya</th>
                                    <th>Toplam</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${d.map(l=>{const c=l.date===(f==null?void 0:f.date),T=new Date(l.date).toLocaleDateString("tr-TR",{weekday:"short"});return`<tr${c?' class="top-row"':""}>
                                        <td>${new Date(l.date).toLocaleDateString("tr-TR",{day:"2-digit",month:"2-digit"})}</td>
                                        <td style="color:var(--txt2);font-family:sans-serif;font-size:12px;">${T}</td>
                                        <td>${v(l.restoran)}</td>
                                        <td>${v(l.cafetarya)}</td>
                                        <td style="font-weight:700;${c?"color:var(--orange);":""}">${v(l.total)}</td>
                                    </tr>`}).join("")}
                            </tbody>
                        </table>
                    </div>
                `}catch(t){a.innerHTML=`<div style="text-align:center;padding:40px;color:var(--red);">⚠️ Veri yüklenirken hata: ${t.message}</div>`}};window.closeVerimlilik=function(){document.getElementById("verimlilikModal").style.display="none"};document.getElementById("verimlilikModal").addEventListener("click",function(a){a.target===this&&closeVerimlilik()});function H(a){return a?new Date(a).toLocaleDateString("tr-TR",{day:"2-digit",month:"2-digit"}):"-"}function V(a){return a?new Date(a).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"}):"-"}function gt(a){return a?a.split(" ").map(t=>t[0]).join(""):"??"}function yt(a){if(!a)return"t";const t=a.split(" ")[0];return{Tuba:"t",Elif:"e",Melda:"m",Ceren:"c"}[t]||"t"}function j(a){return{yeni:"🌱 Yeni",bronz:"🥉 Bronz",gumus:"🥈 Gümüş",altin:"🥇 Altın",elmas:"💎 Elmas",efsane:"👑 Efsane",efsane_plus:"👑⭐ Süper Efsane",ozel_yildiz:"🌟 Yılın Yıldızı",ozel_ates:"🔥 Ateş Çıkışlı",ozel_roket:"🚀 Hızlı Yükseliş",ozel_onur:"🏅 Onur Madalyası",ozel_takim:"🤝 Takım Ruhu"}[a]||"🌱 Yeni"}window.assignBadge=async function(a,t){const e=[{key:"ozel_yildiz",icon:"🌟",name:"Yılın Yıldızı",desc:"En parlak performans"},{key:"ozel_ates",icon:"🔥",name:"Ateş Çıkışlı",desc:"Haftanın en iyisi"},{key:"ozel_roket",icon:"🚀",name:"Hızlı Yükseliş",desc:"En hızlı gelişim"},{key:"ozel_onur",icon:"🏅",name:"Onur Madalyası",desc:"Olağanüstü hizmet"},{key:"ozel_takim",icon:"🤝",name:"Takım Ruhu",desc:"Ekip çalışması"}],s=document.createElement("div");s.className="badge-modal-overlay",s.innerHTML=`
                <div class="badge-modal-box">
                    <div class="badge-modal-header">
                        <h3>🎖️ ${t} — Rozet Ver</h3>
                        <button onclick="this.closest('.badge-modal-overlay').remove()" class="close-btn" style="background:none;border:none;font-size:20px;color:var(--txt2);cursor:pointer;">✕</button>
                    </div>
                    <div class="badge-option-grid">
                        ${e.map(i=>`
                            <div class="badge-option" data-key="${i.key}" onclick="selectBadgeOption(this,'${i.key}')">
                                <div class="badge-icon">${i.icon}</div>
                                <div class="badge-name">${i.name}</div>
                                <div class="badge-desc">${i.desc}</div>
                            </div>
                        `).join("")}
                        <div class="badge-option" data-key="auto" onclick="selectBadgeOption(this,'auto')">
                            <div class="badge-icon">🔄</div>
                            <div class="badge-name">Otomatik</div>
                            <div class="badge-desc">Puana göre hesapla</div>
                        </div>
                    </div>
                    <div class="badge-modal-actions">
                        <button class="badge-cancel-btn" onclick="this.closest('.badge-modal-overlay').remove()">İptal</button>
                        <button class="badge-save-btn" onclick="saveBadgeAssignment('${a}')">💾 Kaydet</button>
                    </div>
                </div>`,document.body.appendChild(s)};window.selectBadgeOption=function(a,t){document.querySelectorAll(".badge-option").forEach(e=>e.classList.remove("selected")),a.classList.add("selected"),a.closest(".badge-modal-overlay").__selectedBadge=t};window.saveBadgeAssignment=async function(a){const t=document.querySelector(".badge-modal-overlay"),e=t==null?void 0:t.__selectedBadge;if(!e){alert("Lütfen bir rozet seçin.");return}try{let s=e;if(e==="auto"){const{data:n}=await $.from("cashiers").select("total_points").eq("id",a).single(),o=(n==null?void 0:n.total_points)||0;o>=600?s="efsane_plus":o>=400?s="efsane":o>=250?s="elmas":o>=150?s="altin":o>=75?s="gumus":o>=30?s="bronz":s="yeni"}const{error:i}=await $.from("cashiers").update({badge_level:s}).eq("id",a);if(i)throw i;t.remove(),_(`✅ Rozet atandı: ${j(s)}`,"success"),await loadDashboard()}catch(s){console.error("Rozet atama hatası:",s),alert("❌ Hata: "+s.message)}};window.toggleDetails=function(){const a=document.getElementById("detailedSection"),t=document.getElementById("toggleIcon"),e=document.getElementById("toggleText");a&&(a.style.display==="none"?(a.style.display="block",t.textContent="🙈",e.textContent="Detaylı Verileri Gizle"):(a.style.display="none",t.textContent="👁️",e.textContent="Detaylı Verileri Göster"))};window.setDateFilter=function(a){u=a,C=null,S=null,document.querySelectorAll(".filter-btn").forEach(d=>d.classList.remove("active"));const t=document.querySelector(`[data-range="${a}"]`);t&&t.classList.add("active");const e=new Date,s=e.toLocaleDateString("tr-TR",{month:"long",year:"numeric"}),n=new Date(e.getFullYear(),e.getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"}),o={week:"Son 7 gün",month:`Bu Ay (${s})`,lastmonth:`Geçen Ay (${n})`,all:"Tüm veriler"},y=document.getElementById("filterInfo");y&&(y.textContent=o[a]||""),window.loadDashboard()};window.showDayPicker=function(){const a=document.createElement("div");a.className="custom-date-modal",a.style.display="flex",a.id="dayPickerModal",a.innerHTML=`
                <div class="custom-date-box">
                    <div class="custom-date-header">
                        <h3>📅 Belirli Gün Seçin</h3>
                        <button onclick="document.getElementById('dayPickerModal').remove()" class="close-btn">✕</button>
                    </div>
                    <div class="custom-date-content">
                        <div class="date-input-group">
                            <label>Tarih Seçin</label>
                            <input type="date" id="singleDayPicker" max="${new Date().toISOString().split("T")[0]}" />
                        </div>
                        <div style="margin-top:12px;padding:12px;background:rgba(59,130,246,.1);border-radius:8px;font-size:13px;color:var(--txt2);">
                            💡 Yalnızca seçilen günün verileri gösterilir.
                        </div>
                    </div>
                    <div class="custom-date-actions">
                        <button onclick="document.getElementById('dayPickerModal').remove()" class="modal-btn cancel">
                            İptal
                        </button>
                        <button onclick="applyDayFilter()" class="modal-btn apply">
                            Göster
                        </button>
                    </div>
                </div>
            `,document.body.appendChild(a),document.getElementById("singleDayPicker").value=E||new Date().toISOString().split("T")[0]};window.applyDayFilter=function(){const a=document.getElementById("singleDayPicker"),t=a==null?void 0:a.value;if(!t){alert("⚠️ Lütfen bir tarih seçin!");return}E=t,u="day",C=null,S=null,document.querySelectorAll(".filter-btn").forEach(o=>o.classList.remove("active"));const e=document.querySelector('[data-range="day"]');e&&e.classList.add("active");const s=new Date(t).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}),i=document.getElementById("filterInfo");i&&(i.textContent=s);const n=document.getElementById("dayPickerModal");n&&n.remove(),window.loadDashboard()};window.showCustomDatePicker=function(){const a=document.getElementById("customDateModal"),t=new Date().toISOString().split("T")[0];if(document.getElementById("customStartDate").max=t,document.getElementById("customEndDate").max=t,C)document.getElementById("customStartDate").value=C;else{const e=new Date;e.setDate(e.getDate()-7),document.getElementById("customStartDate").value=e.toISOString().split("T")[0]}document.getElementById("customEndDate").value=S||t,a.style.display="flex"};window.closeCustomDatePicker=function(){document.getElementById("customDateModal").style.display="none"};window.applyCustomDateRange=function(){const a=document.getElementById("customStartDate").value,t=document.getElementById("customEndDate").value;if(!a||!t){alert("⚠️ Lütfen başlangıç ve bitiş tarihlerini seçin!");return}if(a>t){alert("⚠️ Başlangıç tarihi bitiş tarihinden sonra olamaz!");return}C=a,S=t,u="custom",document.querySelectorAll(".filter-btn").forEach(o=>o.classList.remove("active"));const e=document.querySelector('[data-range="custom"]');e&&e.classList.add("active");const s=new Date(a).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),i=new Date(t).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),n=document.getElementById("filterInfo");n&&(n.textContent=`${s} - ${i}`),window.closeCustomDatePicker(),window.loadDashboard()};window.loadDashboard=async function(){try{document.getElementById("mainContent").innerHTML=`
                    <div class="loading">
                        <div class="spinner"></div>
                        <div>Veriler yükleniyor...</div>
                    </div>
                `;const{weekly:a,reports:t,cashiers:e}=await Z();M=t,await rt(a,t,e)}catch(a){console.error("Dashboard yükleme hatası:",a),document.getElementById("mainContent").innerHTML=`
                <div class="loading">
                    <div style="font-size:48px;margin-bottom:16px;">❌</div>
                    <div style="font-size:18px;color:var(--red);">Veri yükleme hatası!</div>
                    <div style="color:var(--txt2);margin-top:8px;">${a.message}</div>
                    <button onclick="loadDashboard()" class="nb" style="margin-top:20px;">🔄 Tekrar Dene</button>
                </div>
            `}};window.loadDashboard();setInterval(()=>window.loadDashboard(),5*60*1e3);window.deleteEntry=async function(a){console.log("deleteEntry çağrıldı:",a);const t=document.createElement("div");t.className="modal-overlay",t.innerHTML=`
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
                        <button class="modal-btn confirm" onclick="confirmDelete('${a}')">
                            Sil
                        </button>
                    </div>
                </div>
            `,document.body.appendChild(t)};window.confirmDelete=async function(a){const t=document.querySelector(".modal-overlay");try{console.log("Siliniyor:",a);const{data:e,error:s}=await $.from("daily_reports").delete().eq("id",a);if(console.log("Delete response:",{data:e,error:s}),s)throw new Error(s.message);t&&t.remove(),_("✅ Kayıt başarıyla silindi!","success"),await loadDashboard()}catch(e){console.error("Silme hatası:",e),_("❌ Silme başarısız: "+e.message,"error"),t&&t.remove()}};window.editEntry=async function(a){console.log("editEntry çağrıldı:",a);const{data:t,error:e}=await $.from("daily_reports").select("*").eq("id",a).single();if(e){_("❌ Kayıt bulunamadı","error");return}const s=document.createElement("div");s.className="modal-overlay",s.innerHTML=`
                <div class="modal-box" style="max-width:600px;">
                    <div class="modal-title">✏️ Kaydı Düzenle</div>
                    <div class="modal-content">
                        <div style="display:grid;gap:12px;">
                            <div>
                                <label style="font-size:12px;color:var(--txt2);display:block;margin-bottom:4px;">Z Ciro</label>
                                <input type="number" id="editZCiro" value="${parseFloat(t.rumeli_z1||0)+parseFloat(t.rumeli_z2||0)+parseFloat(t.balik_ekmek||0)+parseFloat(t.dondurma||0)}" 
                                    style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--brd);background:var(--input);color:var(--txt);">
                            </div>
                            <div>
                                <label style="font-size:12px;color:var(--txt2);display:block;margin-bottom:4px;">Puan</label>
                                <input type="number" id="editPuan" value="${t.points_earned||0}" 
                                    style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--brd);background:var(--input);color:var(--txt);">
                            </div>
                            <div>
                                <label style="font-size:12px;color:var(--txt2);display:block;margin-bottom:4px;">Durum</label>
                                <select id="editDurum" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--brd);background:var(--input);color:var(--txt);">
                                    <option value="true" ${t.is_on_time?"selected":""}>✅ Zamanında</option>
                                    <option value="false" ${t.is_on_time?"":"selected"}>⚠️ Geç</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="modal-btn cancel" onclick="this.closest('.modal-overlay').remove()">
                            İptal
                        </button>
                        <button class="modal-btn confirm" style="background:var(--acc);" onclick="confirmEdit('${a}')">
                            Kaydet
                        </button>
                    </div>
                </div>
            `,document.body.appendChild(s)};window.confirmEdit=async function(a){const t=document.querySelector(".modal-overlay");try{const e=parseFloat(document.getElementById("editZCiro").value)||0,s=parseInt(document.getElementById("editPuan").value)||0,i=document.getElementById("editDurum").value==="true";console.log("Güncelleniyor:",{entryId:a,newZCiro:e,newPuan:s,newDurum:i});const{error:n}=await $.from("daily_reports").update({total_revenue:e,points_earned:s,is_on_time:i}).eq("id",a);if(n)throw n;const{data:o}=await $.from("daily_reports").select("cashier_id").eq("id",a).single();if(!o)throw new Error("Kayıt bulunamadı");const{data:y}=await $.from("daily_reports").select("points_earned").eq("cashier_id",o.cashier_id),d=y.reduce((h,f)=>h+(parseInt(f.points_earned)||0),0);console.log("Toplam puan:",d);let m="yeni";d>=1e3?m="efsane":d>=500?m="elmas":d>=300?m="altin":d>=150?m="gumus":d>=50&&(m="bronz");const{error:p}=await $.from("cashiers").update({total_points:d,badge_level:m}).eq("id",o.cashier_id);if(p)throw p;t&&t.remove(),_("✅ Kayıt ve kasiyer puanı güncellendi!","success"),await loadDashboard()}catch(e){console.error("Güncelleme hatası:",e),_("❌ Güncelleme başarısız: "+e.message,"error"),t&&t.remove()}};function _(a,t="success"){const e=document.createElement("div");e.style.cssText=`
                position:fixed;
                bottom:20px;
                right:20px;
                background:${t==="success"?"var(--green)":"var(--red)"};
                color:#fff;
                padding:16px 20px;
                border-radius:12px;
                font-size:14px;
                font-weight:600;
                z-index:3000;
                box-shadow:0 8px 24px rgba(0,0,0,.3);
                animation:slideIn .3s;
            `,e.textContent=a,document.body.appendChild(e),setTimeout(()=>{e.style.animation="slideOut .3s",setTimeout(()=>e.remove(),300)},3e3)}
