import"./modulepreload-polyfill-B5Qt9EMX.js";import{supabase as T}from"./supabase-client-CFSZQWn8.js";import"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";let v="month",R=null,I=null,z=null;function $(a){return a.getFullYear()+"-"+String(a.getMonth()+1).padStart(2,"0")+"-"+String(a.getDate()).padStart(2,"0")}async function W(){let a,t=null;const e=new Date;if(v==="day"&&z)a=z,t=z;else if(v==="custom"&&R&&I)a=R,t=I;else switch(v){case"week":const l=new Date;l.setDate(l.getDate()-7),a=$(l);break;case"month":a=$(new Date(e.getFullYear(),e.getMonth(),1)),t=$(new Date(e.getFullYear(),e.getMonth()+1,0));break;case"lastmonth":a=$(new Date(e.getFullYear(),e.getMonth()-1,1)),t=$(new Date(e.getFullYear(),e.getMonth(),0));break;case"all":a="2020-01-01";break;default:a=$(new Date(e.getFullYear(),e.getMonth(),1)),t=$(new Date(e.getFullYear(),e.getMonth()+1,0))}let s=T.from("daily_reports").select("*, cashiers(name)").gte("date",a).order("date",{ascending:!1});t&&(s=s.lte("date",t));const[i,n]=await Promise.all([s,T.from("cashiers").select("*").order("total_points",{ascending:!1})]);return{weekly:[],reports:i.data||[],cashiers:n.data||[]}}function U(a){const t={};return a.forEach(e=>{const s=`${e.date}-${e.kasa}`;(!t[s]||e.shift==="aksam")&&(t[s]=e)}),Object.values(t).reduce((e,s)=>(e.restoran+=parseFloat(s.rumeli_z2||0),e.cafetarya+=parseFloat(s.rumeli_z1||0),e.balik+=parseFloat(s.balik_ekmek||0),e.dondurma+=parseFloat(s.dondurma||0),e.total+=parseFloat(s.rumeli_z2||0)+parseFloat(s.rumeli_z1||0)+parseFloat(s.balik_ekmek||0)+parseFloat(s.dondurma||0),e),{restoran:0,cafetarya:0,balik:0,dondurma:0,total:0})}function O(a){const t={};a.forEach(i=>{const n=`${i.date}-${i.kasa}`;(!t[n]||i.shift==="aksam")&&(t[n]=i)});const e={};Object.values(t).forEach(i=>{const n=i.date;e[n]||(e[n]=0),e[n]+=parseFloat(i.rumeli_z2||0)+parseFloat(i.rumeli_z1||0)+parseFloat(i.balik_ekmek||0)+parseFloat(i.dondurma||0)});const s=Object.keys(e).sort();return{labels:s.map(i=>V(i)),data:s.map(i=>e[i])}}function Q(a){const t={sabah:0,aksam:0};return a.forEach(e=>{const s=parseFloat(e.individual_revenue||0);e.shift==="sabah"?t.sabah+=s:e.shift==="aksam"&&(t.aksam+=s)}),t}function J(a,t){const e={};return a.forEach(s=>{var n;const i=((n=s.cashiers)==null?void 0:n.name)||"Bilinmiyor";e[i]||(e[i]=0),e[i]+=parseFloat(s.individual_revenue||0)}),e}function X(a,t){const e=$(new Date),s=a.filter(u=>u.date===e),i=[...new Set(s.map(u=>u.cashier_id))],n=t.filter(u=>!i.includes(u.id)),l=a.filter(u=>!u.is_on_time),y=O(a),c=Math.max(...y.data,0);return{notEntered:n,lateEntries:l,maxCiro:c}}function tt(a){const t=O(a),e=Math.max(...t.data,0),s=$(new Date),i=a.filter(u=>u.date===s),l=[...new Set(i.map(u=>u.cashier_id))].length;return{maxDailyCiro:e,activeCashiers:l,avgEntryTime:"2.5dk",weeklyGrowth:"+12%"}}function at(){const a=new Date,t=a.getDay(),e=["2026-01-01","2026-04-23","2026-05-01","2026-05-19","2026-08-30","2026-10-29"],s=$(a);return e.includes(s)?"special":t===0||t===6?"weekend":"weekday"}async function et(){try{const a=at();console.log("Hedef tipi:",a);const{data:t,error:e}=await T.from("targets").select("amount").eq("target_type",a).single();return e?(console.error("Hedef çekme hatası:",e),{weekday:15e4,weekend:2e5,special:25e4}[a]):(console.log("Çekilen hedef:",t.amount),parseFloat(t.amount)||15e4)}catch(a){return console.error("fetchDailyTarget hatası:",a),15e4}}function it(){typeof anime>"u"||(anime({targets:".kasa-card, .sc, .total-hero-card",opacity:[0,1],translateY:[40,0],delay:anime.stagger(100),duration:800,easing:"easeOutCubic"}),anime({targets:".rank-card",opacity:[0,1],translateX:[-40,0],delay:anime.stagger(120),duration:700,easing:"easeOutCubic"}))}function st(){if(typeof anime>"u")return;const a=document.getElementById("totalDailyCiro"),t=parseFloat(a.getAttribute("data-value")||0);anime({targets:{value:0},value:t,duration:2e3,easing:"easeOutExpo",update:function(i){a.textContent=m(i.animations[0].currentValue)}});const e=document.getElementById("progressBarFill"),s=parseFloat(e.getAttribute("data-percent")||0);anime({targets:"#progressBarFill",width:s+"%",duration:1500,easing:"easeInOutQuad"})}function nt(a){const t={gida:{name:"Gıda",icon:"🥗",total:0,color:"#22c55e"},kahvalti:{name:"Kahvaltı",icon:"🥐",total:0,color:"#f59e0b"},kahve:{name:"Kahve",icon:"☕",total:0,color:"#8b5cf6"},meyvesuyu:{name:"Meyve Suyu",icon:"🧃",total:0,color:"#ec4899"},sicak_icecek:{name:"Sıcak İçecek",icon:"🔥",total:0,color:"#ef4444"},soguk_icecek:{name:"Soğuk İçecek",icon:"🥤",total:0,color:"#3b82f6"},tatli:{name:"Tatlı",icon:"🍰",total:0,color:"#a855f7"}},e={};a.forEach(n=>{const l=`${n.date}-${n.kasa}`;(!e[l]||n.shift==="aksam")&&(e[l]=n)}),Object.values(e).forEach(n=>{t.gida.total+=parseFloat(n.gida)||0,t.kahvalti.total+=parseFloat(n.kahvalti)||0,t.kahve.total+=parseFloat(n.kahve)||0,t.meyvesuyu.total+=parseFloat(n.meyvesuyu)||0,t.sicak_icecek.total+=parseFloat(n.sicak_icecek)||0,t.soguk_icecek.total+=parseFloat(n.soguk_icecek)||0,t.tatli.total+=parseFloat(n.tatli)||0});const s=Object.values(t).reduce((n,l)=>n+l.total,0);Object.values(t).forEach(n=>{n.percentage=s>0?n.total/s*100:0});const i=Object.entries(t).map(([n,l])=>({key:n,...l})).sort((n,l)=>l.total-n.total);return{categories:i,total:s,highest:i[0],lowest:i[i.length-1],average:s/i.length}}function ot(a){return a.categories.map(t=>`
                <div class="category-card">
                    <div class="category-header">
                        <span class="category-icon">${t.icon}</span>
                        <span class="category-name">${t.name}</span>
                    </div>
                    <div class="category-amount">${m(t.total)}</div>
                    <div class="category-stats">
                        <span class="category-percentage">${t.percentage.toFixed(1)}% pay</span>
                    </div>
                </div>
            `).join("")}function lt(a){var e;const t=((e=a.categories[0])==null?void 0:e.total)||1;return a.categories.map(s=>{const i=t>0?s.total/t*100:0;return`
                    <div class="category-bar">
                        <div class="category-bar-label">${s.icon} ${s.name}</div>
                        <div class="category-bar-track">
                            <div class="category-bar-fill" style="width:${i}%;background:${s.color};">
                                ${M(s.total)}
                            </div>
                        </div>
                    </div>
                `}).join("")}function rt(a){return`
                <div class="category-summary-card">
                    <div class="summary-icon">🏆</div>
                    <div class="summary-label">En Çok Satan</div>
                    <div class="summary-value">${a.highest.icon} ${a.highest.name}</div>
                    <div style="font-size:12px;color:var(--acc);margin-top:4px;font-weight:600;">${M(a.highest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📉</div>
                    <div class="summary-label">En Az Satan</div>
                    <div class="summary-value">${a.lowest.icon} ${a.lowest.name}</div>
                    <div style="font-size:12px;color:var(--txt3);margin-top:4px;font-weight:600;">${M(a.lowest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📊</div>
                    <div class="summary-label">Kategori Ort.</div>
                    <div class="summary-value">${M(a.average)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">Kategori başına</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">💰</div>
                    <div class="summary-label">Kategori Toplamı</div>
                    <div class="summary-value">${M(a.total)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">7 kategori</div>
                </div>
            `}async function dt(a,t,e){const s=await et(),i=U(t),n=O(t),l=Q(t),y=J(t),c=X(t,e),u=tt(t),b=nt(t),w={};t.forEach(d=>{var L;const g=d.cashier_id,K=((L=d.cashiers)==null?void 0:L.name)||"Bilinmiyor";w[g]||(w[g]={name:K,points:0,entries:0,revenue:0}),w[g].points+=parseInt(d.points_earned)||0,w[g].entries+=1,w[g].revenue+=parseFloat(d.individual_revenue)||0});const f=Object.values(w).sort((d,g)=>g.points-d.points),x=f.length>0?f[0]:null,h=t.length,E=t.filter(d=>d.is_on_time).length,F=h>0?Math.round(E/h*100):0,k=[...new Set(t.map(d=>d.date))].length,_=k>0?i.total/k:0,S=i.total,o=v==="day"&&z?z:$(new Date),r={};t.filter(d=>d.date===o).forEach(d=>{const g=`${d.date}-${d.kasa}`;(!r[g]||d.shift==="aksam")&&(r[g]=d)});const p=Object.values(r).reduce((d,g)=>d+parseFloat(g.total_revenue||0),0),C=s>0?Math.min(100,Math.round(p/s*100)):0,D=v==="week"?"Bu Hafta":v==="month"?`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long"})})`:v==="lastmonth"?`Geçen Ay (${new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long"})})`:v==="all"?"Tüm Veriler":v==="day"&&z?new Date(z).toLocaleDateString("tr-TR",{day:"numeric",month:"short"}):R?`${new Date(R).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"})} - ${new Date(I).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"})}`:"Bu Ay";document.getElementById("mainContent").innerHTML=`

            <!-- TARİH FİLTRESİ -->
            <div class="date-filter-section">
                <div class="filter-label">📅 Tarih Aralığı:</div>
                <div class="filter-buttons">
                    <button class="filter-btn ${v==="month"?"active":""}" data-range="month" onclick="setDateFilter('month')">Bu Ay</button>
                    <button class="filter-btn ${v==="lastmonth"?"active":""}" data-range="lastmonth" onclick="setDateFilter('lastmonth')">Geçen Ay</button>
                    <button class="filter-btn ${v==="week"?"active":""}" data-range="week" onclick="setDateFilter('week')">Bu Hafta</button>
                    <button class="filter-btn ${v==="all"?"active":""}" data-range="all" onclick="setDateFilter('all')">Tümü</button>
                    <button class="filter-btn ${v==="day"?"active":""}" data-range="day" onclick="showDayPicker()">📅 Belirli Gün</button>
                    <button class="filter-btn ${v==="custom"?"active":""}" data-range="custom" onclick="showCustomDatePicker()">Özel Aralık ▼</button>
                </div>
                <div class="filter-info" id="filterInfo">
                    ${v==="week"?"Son 7 gün":v==="month"?`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`:v==="lastmonth"?`Geçen Ay (${new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`:v==="all"?"Tüm veriler":v==="day"&&z?new Date(z).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}):R?`${new Date(R).toLocaleDateString("tr-TR")} - ${new Date(I).toLocaleDateString("tr-TR")}`:`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`}
                </div>
            </div>

            <!-- GÜNLÜK TOPLAM HERO KARTI -->
            <div class="section-title">💰 Rumeli İskelesi Toplam Ciro</div>
            <div class="total-hero-card">
                <div class="total-hero-left">
                    <div class="total-hero-label">${v==="month"?"Bu Ay Toplam Ciro":v==="week"?"Bu Hafta Toplam Ciro":v==="day"?"Günlük Toplam Ciro":"Dönem Toplam Ciro"}</div>
                    <div class="total-hero-amount" id="totalDailyCiro" data-value="${S}">0,00 ₺</div>
                    <div class="total-hero-breakdown">
                        <span class="breakdown-item">🍽️ <span id="breakdownRestoran">${m(i.restoran)}</span></span>
                        <span class="breakdown-item">☕ <span id="breakdownCafetarya">${m(i.cafetarya)}</span></span>
                        <span class="breakdown-item">🐟 <span id="breakdownBalik">${m(i.balik)}</span></span>
                        <span class="breakdown-item">🍦 <span id="breakdownDondurma">${m(i.dondurma)}</span></span>
                    </div>
                </div>
                <div class="total-hero-right">
                    <div class="target-section">
                        <div class="target-label">📊 Rumeli İskelesi (Rest.+Cafe)</div>
                        <div class="target-amount">${m(i.restoran+i.cafetarya)}</div>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" id="progressBarFill" style="width:0%" data-percent="${C}"></div>
                        </div>
                        <div class="progress-percent" id="progressPercent">Günlük Ort: ${m(k>0?(i.restoran+i.cafetarya)/k:0)}</div>
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
                    <div class="sc-l">${v==="month"?"Bu Ay Toplam Ciro":v==="week"?"Bu Hafta Toplam Ciro":v==="day"?"Günlük Toplam Ciro":"Dönem Toplam Ciro"}</div>
                    <div class="sc-v">${m(i.total)}</div>
                    <div class="sc-s">${k} günlük veri</div>
                </div>
                <div class="sc purple">
                    <div class="sc-l">Günlük Ortalama (Tüm)</div>
                    <div class="sc-v">${m(_)}</div>
                    <div class="sc-s">Son ${k} gün</div>
                </div>
                <div class="sc emerald">
                    <div class="sc-l">🏢 Rumeli İskelesi Toplam</div>
                    <div class="sc-v">${m(i.restoran+i.cafetarya)}</div>
                    <div class="sc-s">Restoran + Cafetarya</div>
                </div>
                <div class="sc cyan">
                    <div class="sc-l">🏢 Rumeli İskelesi Günlük Ort.</div>
                    <div class="sc-v">${m(k>0?(i.restoran+i.cafetarya)/k:0)}</div>
                    <div class="sc-s">${k} günlük ortalama</div>
                </div>
                <div class="sc orange">
                    <div class="sc-l">Zamanında Giriş</div>
                    <div class="sc-v">%${F}</div>
                    <div class="sc-s">${E}/${h} giriş</div>
                </div>
                <div class="sc green">
                    <div class="sc-l">Toplam Giriş Sayısı</div>
                    <div class="sc-v">${h}</div>
                    <div class="sc-s">${k} günlük</div>
                </div>
                <div class="sc pink">
                    <div class="sc-l">En Yüksek Günlük Ciro</div>
                    <div class="sc-v" id="maxDailyCiro">${m(u.maxDailyCiro)}</div>
                    <div class="sc-s">Dönem rekoru</div>
                </div>
                <div class="sc indigo">
                    <div class="sc-l">Aktif Kasiyer</div>
                    <div class="sc-v" id="activeCashiers">${u.activeCashiers}/${e.length}</div>
                    <div class="sc-s">Bugün giriş yapan</div>
                </div>
            </div>

            <!-- KATEGORİ SATIŞ ANALİZİ -->
            <div class="section-title">🏷️ Kategori Bazlı Satış Analizi</div>

            <!-- Kategori Kartları -->
            <div class="category-cards-grid">
                ${ot(b)}
            </div>

            <!-- Kategori Grafikler + Özet -->
            <div class="category-charts">
                <div class="category-chart-box">
                    <div class="chart-title">📊 Kategori Karşılaştırması</div>
                    ${lt(b)}
                </div>
                <div class="category-chart-box">
                    <div class="chart-title">📋 Özet İstatistikler</div>
                    <div class="category-summary">
                        ${rt(b)}
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
                    <div class="chart-title">⚖️ Vardiya Karşılaştırması — ${D}</div>
                    <div class="chart-wrap">
                        <canvas id="shiftChart"></canvas>
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-title">👥 Kasiyer Ciro Performansı — ${D}</div>
                    <div class="chart-wrap">
                        <canvas id="cashierChart"></canvas>
                    </div>
                </div>
            </div>

            <!-- UYARILAR -->
            <div class="section-title">⚠️ Uyarılar</div>
            <div class="alerts-grid">
                <div class="alert-card ${c.notEntered.length>0?"danger":"ok"}">
                    <div class="alert-title">
                        ${c.notEntered.length>0?"❌":"✅"} Bugün Giriş Yapmayanlar
                    </div>
                    ${c.notEntered.length===0?'<div class="alert-item">Tüm kasiyerler giriş yaptı!</div>':c.notEntered.map(d=>`
                            <div class="alert-item">
                                <span>${d.name}</span>
                                <span style="color:var(--red)">Giriş Yok</span>
                            </div>
                        `).join("")}
                </div>
                <div class="alert-card ${c.lateEntries.length>0?"warning":"ok"}">
                    <div class="alert-title">⚠️ Geç Girişler (Bu Hafta)</div>
                    ${c.lateEntries.length===0?'<div class="alert-item">Bu hafta geç giriş yok! 🎉</div>':c.lateEntries.slice(0,5).map(d=>{var g;return`
                            <div class="alert-item">
                                <span>${((g=d.cashiers)==null?void 0:g.name)||"Bilinmiyor"}</span>
                                <span style="color:var(--orange)">${j(d.entry_time)}</span>
                            </div>
                        `}).join("")}
                </div>
                <div class="alert-card ok">
                    <div class="alert-title">📊 Haftalık Özet</div>
                    <div class="alert-item">
                        <span>En Yüksek Gün</span>
                        <span style="color:var(--green)">${m(c.maxCiro)}</span>
                    </div>
                    <div class="alert-item">
                        <span>Toplam Puan</span>
                        <span style="color:var(--orange)">${a.reduce((d,g)=>d+(g.weekly_points||0),0)}</span>
                    </div>
                    <div class="alert-item">
                        <span>Aktif Kasiyer</span>
                        <span style="color:var(--green)">${a.filter(d=>(d.total_entries||0)>0).length}/${e.length}</span>
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
                            ${e.map(d=>`<option value="${d.id}">${d.name}</option>`).join("")}
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
                                ${Y(t)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- KASİYER SIRALAMALARI -->
            <div class="section-title" style="margin-top:40px;">👥 Kasiyer Sıralaması <span style="font-size:13px;font-weight:500;color:var(--txt2);">(Bu Ay)</span></div>
            <div id="rankGrid" class="rank-grid">
                ${f.map((d,g)=>{const K=e.find(Z=>(Z.name||"")===d.name)||{},L=K.id||"",N=q(K.badge_level);return`
                    <div class="rank-card">
                        <div class="rank-pos p${Math.min(g+1,4)}">#${g+1}</div>
                        <div class="rank-avatar av-${pt(d.name)}">${gt(d.name)}</div>
                        <div class="rank-info">
                            <div class="rank-name">${d.name}</div>
                            <div class="rank-meta">
                                ${d.entries} giriş · ${m(d.revenue)} ciro
                            </div>
                        </div>
                        <div class="rank-right">
                            <div class="rank-pts">${d.points} puan</div>
                            <div class="rank-badge-pill">${N}</div>
                            ${L?`<button class="badge-assign-btn" onclick="assignBadge('${L}','${d.name}')">🎖️ Rozet Ver</button>`:""}
                        </div>
                    </div>`}).join("")}
            </div>

            <!-- AYIN ELEMANI HERO -->
            <div id="heroSection" class="hero ${x&&x.points>0?"gold":"blue"}" style="margin-top:24px;">
                <div class="hero-badge">🏆 AYIN ELEMANI</div>
                <div class="hero-name">${x?x.name:"Henüz Veri Yok"}</div>
                <div class="hero-amt">${x?x.points:0} Puan</div>
                <div class="hero-sub">
                    ${x?`${x.entries} giriş · ${m(x.revenue)}`:"İlk veriyi girin!"}
                </div>
            </div>
        `,ct(n,i,l,y);const G=document.getElementById("applyFiltersBtn"),H=document.getElementById("clearFiltersBtn");G&&G.addEventListener("click",mt),H&&H.addEventListener("click",vt),document.getElementById("lastUpdate").textContent="Son güncelleme: "+new Date().toLocaleTimeString("tr-TR",{timeZone:"Europe/Istanbul"}),setTimeout(()=>{it(),st(),ut()},100),yt(s,p,C)}let B={};function ct(a,t,e,s){Chart.defaults.color="#7a8ba8",Chart.defaults.borderColor="#1e3a5f",Chart.defaults.font.family="DM Sans";const i=document.getElementById("dailyChart");i&&(B.daily&&B.daily.destroy(),B.daily=new Chart(i,{type:"bar",data:{labels:a.labels.length>0?a.labels:["Veri Yok"],datasets:[{label:"Günlük Ciro (₺)",data:a.data.length>0?a.data:[0],backgroundColor:"rgba(59,130,246,.7)",borderColor:"#3b82f6",borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:c=>"₺"+new Intl.NumberFormat("tr-TR").format(c)}}}}}));const n=document.getElementById("kasaChart");if(n){B.kasa&&B.kasa.destroy();const c=t.total>0,u=c?[t.restoran,t.cafetarya,t.balik,t.dondurma]:[.001,.001,.001,.001];B.kasa=new Chart(n,{type:"doughnut",data:{labels:["Restoran","Cafetarya","Balık Ekmek","Dondurma"],datasets:[{data:u,backgroundColor:["rgba(59,130,246,.8)","rgba(139,92,246,.8)","rgba(6,182,212,.8)","rgba(236,72,153,.8)"],borderColor:"#111d32",borderWidth:3,hoverOffset:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{position:"bottom",labels:{padding:16,usePointStyle:!0}},tooltip:{enabled:c,callbacks:{label:b=>{const w=b.raw,f=b.dataset.data.reduce((h,E)=>h+E,0),x=Math.round(w/f*100);return` ${b.label}: ${m(w)} (%${x})`}}}},cutout:"65%"}})}const l=document.getElementById("shiftChart");l&&(B.shift&&B.shift.destroy(),B.shift=new Chart(l,{type:"bar",data:{labels:["Sabah Vardiyası","Akşam Vardiyası"],datasets:[{label:"Ciro (₺)",data:[e.sabah||0,e.aksam||0],backgroundColor:["rgba(245,158,11,.7)","rgba(139,92,246,.7)"],borderColor:["#f59e0b","#8b5cf6"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:c=>"₺"+new Intl.NumberFormat("tr-TR").format(c)}}}}}));const y=document.getElementById("cashierChart");if(y){B.cashier&&B.cashier.destroy();const c=Object.keys(s),u=Object.values(s);B.cashier=new Chart(y,{type:"bar",data:{labels:c.length>0?c:["Veri Yok"],datasets:[{label:"Ciro (₺)",data:u.length>0?u:[0],backgroundColor:["rgba(139,92,246,.7)","rgba(245,158,11,.7)","rgba(236,72,153,.7)","rgba(34,197,94,.7)"],borderColor:["#8b5cf6","#f59e0b","#ec4899","#22c55e"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:b=>"₺"+new Intl.NumberFormat("tr-TR").format(b)}}}}})}}let P=[];function Y(a){return a.length===0?'<tr><td colspan="9" style="text-align:center;color:var(--txt2);padding:40px;">Henüz veri yok</td></tr>':a.map(t=>{var i;const e=parseFloat(t.total_revenue||0),s=parseFloat(t.individual_revenue||e);return`
                <tr>
                    <td>${V(t.date)}</td>
                    <td style="font-weight:600">${((i=t.cashiers)==null?void 0:i.name)||"-"}</td>
                    <td><span class="badge ${t.kasa||""}">${t.kasa==="restoran"?"🍽️ Restoran":t.kasa==="cafetarya"?"☕ Cafetarya":"-"}</span></td>
                    <td><span class="badge ${t.shift||""}">${t.shift==="sabah"?"🌅 Sabah":t.shift==="aksam"?"🌙 Akşam":"-"}</span></td>
                    <td class="mono">${j(t.entry_time)}</td>
                    <td class="r">
                        <div class="mono" style="font-weight:700;color:var(--txt);">${m(s)}</div>
                        ${t.shift==="aksam"&&e!==s?`<div style="font-size:11px;color:var(--txt3);">EOD Toplam: ${m(e)}</div>`:""}
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
            `}).join("")}function mt(){const a=document.getElementById("filterDate").value,t=document.getElementById("filterKasiyer").value,e=document.getElementById("filterKasa").value,s=document.getElementById("filterVardiya").value;let i=[...P];a&&(i=i.filter(n=>n.date===a)),t&&(i=i.filter(n=>n.cashier_id===t)),e&&(i=i.filter(n=>n.kasa===e)),s&&(i=i.filter(n=>n.shift===s)),document.getElementById("entriesBody").innerHTML=Y(i)}function vt(){document.getElementById("filterDate").value="",document.getElementById("filterKasiyer").value="",document.getElementById("filterKasa").value="",document.getElementById("filterVardiya").value="",document.getElementById("entriesBody").innerHTML=Y(P)}function m(a){return new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(a||0)+" ₺"}function M(a){return m(a)}function ut(){document.querySelectorAll(".kasa-amount[data-target]").forEach(a=>{const t=parseFloat(a.dataset.target)||0,e=1200,s=performance.now();function i(n){const l=Math.min((n-s)/e,1),y=1-Math.pow(1-l,3);a.textContent=m(t*y),l<1?requestAnimationFrame(i):a.textContent=m(t)}requestAnimationFrame(i)})}function yt(a,t,e){const s=document.getElementById("floatingTarget");if(!s)return;s.style.display="block",document.getElementById("ftPct").textContent=e+"%",document.getElementById("ftTarget").textContent=m(a),document.getElementById("ftCurrent").textContent=m(t);const i=[[100,"🎉 Hedef Tamamlandı!"],[80,"💪 Hedefe Yakın!"],[50,"⏰ Yarı Yolda!"],[0,"🚀 Devam Edelim!"]];document.getElementById("ftStatus").textContent=(i.find(([l])=>e>=l)||i[3])[1];const n=document.getElementById("ftBar");n.classList.toggle("done",e>=100),n.classList.toggle("near",e>=80&&e<100),setTimeout(()=>{n.style.width=Math.min(100,e)+"%"},200)}window.showVerimlilik=async function(){document.getElementById("verimlilikModal").style.display="flex";const a=document.getElementById("verimlilikBody");a.innerHTML='<div class="loading" style="padding:40px 0;"><div class="spinner"></div><div>Veriler hesaplanıyor...</div></div>';try{const t=new Date,e=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-01`,s=new Date(t.getFullYear(),t.getMonth()+1,0).getDate(),i=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${s}`,{data:n}=await T.from("daily_reports").select("date, kasa, shift, rumeli_z1, rumeli_z2, balik_ekmek, dondurma").in("kasa",["restoran","cafetarya"]).gte("date",e).lte("date",i).order("date",{ascending:!0});if(!n||n.length===0){a.innerHTML='<div style="text-align:center;padding:40px;color:var(--txt2);">Bu ay için veri bulunamadı.</div>';return}const l={};n.forEach(o=>{const r=`${o.date}-${o.kasa}`;if(!l[r])l[r]=o;else{const p=l[r],C=o.kasa==="restoran"?parseFloat(o.rumeli_z2):parseFloat(o.rumeli_z1),D=p.kasa==="restoran"?parseFloat(p.rumeli_z2):parseFloat(p.rumeli_z1);(p.shift!=="aksam"&&o.shift==="aksam"||p.shift==="aksam"&&o.shift==="aksam"&&C>D)&&(l[r]=o)}});const y={};Object.values(l).forEach(o=>{y[o.date]||(y[o.date]={restoran:0,cafetarya:0,balik:0,dondurma:0}),o.kasa==="restoran"?y[o.date].restoran=parseFloat(o.rumeli_z2)||0:o.kasa==="cafetarya"&&(y[o.date].cafetarya=parseFloat(o.rumeli_z1)||0),y[o.date].balik+=parseFloat(o.balik_ekmek)||0,y[o.date].dondurma+=parseFloat(o.dondurma)||0});const c=Object.entries(y).map(([o,r])=>({date:o,total:(r.restoran||0)+(r.cafetarya||0),restoran:r.restoran||0,cafetarya:r.cafetarya||0,balik:r.balik||0,dondurma:r.dondurma||0})).sort((o,r)=>o.date.localeCompare(r.date)),u=c.reduce((o,r)=>o+r.total,0),b=c.length,w=b>0?u/b:0,f=c.reduce((o,r)=>r.total>o.total?r:o,c[0]),x=["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"],h={},E={};c.forEach(o=>{const[r,p,C]=o.date.split("-").map(Number),D=new Date(r,p-1,C).getDay();h[D]=(h[D]||0)+o.total,E[D]=(E[D]||0)+1});const F=c.filter(o=>o.balik>0),k=[0,1,2,3,4,5,6].filter(o=>E[o]).map(o=>({name:x[o],avg:h[o]/E[o],idx:o})).sort((o,r)=>r.avg-o.avg),_=k.length>0?k[0].avg:1,S=t.toLocaleDateString("tr-TR",{month:"long",year:"numeric"});a.innerHTML=`
                    <div class="ver-stats-grid">
                        <div class="ver-stat-card">
                            <div class="ver-stat-label">🏢 Rumeli İskelesi Toplam</div>
                            <div class="ver-stat-value">${m(u)}</div>
                            <div class="ver-stat-sub">${S}</div>
                        </div>
                        <div class="ver-stat-card">
                            <div class="ver-stat-label">📅 Veri Günü</div>
                            <div class="ver-stat-value">${b} gün</div>
                            <div class="ver-stat-sub">Girişi olan günler</div>
                        </div>
                        <div class="ver-stat-card">
                            <div class="ver-stat-label">📊 Günlük Ortalama</div>
                            <div class="ver-stat-value">${m(w)}</div>
                            <div class="ver-stat-sub">Restoran + Cafetarya ortalaması</div>
                        </div>
                        <div class="ver-stat-card" style="border-color:var(--orange);">
                            <div class="ver-stat-label">🏆 En İyi Gün</div>
                            <div class="ver-stat-value">${m((f==null?void 0:f.total)||0)}</div>
                            <div class="ver-stat-sub">${f?(()=>{const[o,r,p]=f.date.split("-").map(Number);return new Date(o,r-1,p).toLocaleDateString("tr-TR",{day:"numeric",month:"long",weekday:"short"})})():"-"}</div>
                        </div>
                    </div>

                    <div class="ver-section-title">📈 Haftanın En İyi Günleri (Ortalamaya Göre)</div>
                    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px;">
                        ${k.map((o,r)=>`
                            <div style="display:flex;align-items:center;gap:12px;">
                                <div style="width:20px;text-align:right;font-size:12px;color:var(--txt2);">${r+1}.</div>
                                <div style="width:90px;font-size:13px;font-weight:600;">${o.name}</div>
                                <div style="flex:1;height:8px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;">
                                    <div style="height:100%;width:${Math.round(o.avg/_*100)}%;background:linear-gradient(90deg,${r===0?"#f59e0b,#f97316":"#3b82f6,#06b6d4"});border-radius:4px;transition:width 1s ease;"></div>
                                </div>
                                <div style="width:130px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;color:${r===0?"var(--orange)":"var(--txt)"};">${m(o.avg)}</div>
                            </div>
                        `).join("")}
                    </div>

                    <div class="ver-section-title">📋 Günlük Ciro Detayı — ${S}</div>
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
                                ${c.map(o=>{const r=o.date===(f==null?void 0:f.date),[p,C,D]=o.date.split("-").map(Number),G=new Date(p,C-1,D).toLocaleDateString("tr-TR",{weekday:"short"});return`<tr${r?' class="top-row"':""}>
                                        <td>${String(D).padStart(2,"0")+"/"+String(C).padStart(2,"0")}</td>
                                        <td style="color:var(--txt2);font-family:sans-serif;font-size:12px;">${G}</td>
                                        <td>${m(o.restoran)}</td>
                                        <td>${m(o.cafetarya)}</td>
                                        <td style="font-weight:700;${r?"color:var(--orange);":""}">${m(o.total)}</td>
                                    </tr>`}).join("")}
                            </tbody>
                        </table>
                    </div>

                    ${F.length>0?`
                    <div style="margin-top:16px;">
                        <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.textContent=this.textContent.includes('▶')?'▼ Balık Ekmek Detayını Gizle':'▶ Balık Ekmek Günlük Detayını Gör'"
                            style="background:rgba(6,182,212,.12);border:1px solid rgba(6,182,212,.3);color:var(--cyan);padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;width:100%;text-align:left;">
                            ▶ Balık Ekmek Günlük Detayını Gör
                        </button>
                        <div style="display:none;margin-top:8px;border-radius:10px;border:1px solid rgba(6,182,212,.2);overflow:hidden;">
                            <table class="ver-daily-table">
                                <thead>
                                    <tr>
                                        <th>Tarih</th>
                                        <th>Gün</th>
                                        <th style="color:var(--cyan);">🐟 Balık Ekmek</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${F.map(o=>{const[r,p,C]=o.date.split("-").map(Number),D=new Date(r,p-1,C).toLocaleDateString("tr-TR",{weekday:"short"});return`<tr>
                                            <td>${String(C).padStart(2,"0")+"/"+String(p).padStart(2,"0")}</td>
                                            <td style="color:var(--txt2);font-size:12px;">${D}</td>
                                            <td style="font-weight:700;color:var(--cyan);">${m(o.balik)}</td>
                                        </tr>`}).join("")}
                                    <tr style="border-top:2px solid rgba(6,182,212,.3);">
                                        <td colspan="2" style="font-weight:600;color:var(--txt2);">Aylık Toplam</td>
                                        <td style="font-weight:700;color:var(--cyan);">${m(F.reduce((o,r)=>o+r.balik,0))}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>`:""}
                `}catch(t){a.innerHTML=`<div style="text-align:center;padding:40px;color:var(--red);">⚠️ Veri yüklenirken hata: ${t.message}</div>`}};window.closeVerimlilik=function(){document.getElementById("verimlilikModal").style.display="none"};document.getElementById("verimlilikModal").addEventListener("click",function(a){a.target===this&&closeVerimlilik()});function V(a){if(!a)return"-";const t=a.split("T")[0].split("-");return t.length===3?t[2]+"."+t[1]:a}function j(a){return a?new Date(a).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"}):"-"}function gt(a){return a?a.split(" ").map(t=>t[0]).join(""):"??"}function pt(a){if(!a)return"t";const t=a.split(" ")[0];return{Tuba:"t",Elif:"e",Melda:"m",Ceren:"c"}[t]||"t"}function q(a){return{yeni:"🌱 Yeni",bronz:"🥉 Bronz",gumus:"🥈 Gümüş",altin:"🥇 Altın",elmas:"💎 Elmas",efsane:"👑 Efsane",efsane_plus:"👑⭐ Süper Efsane",ozel_yildiz:"🌟 Yılın Yıldızı",ozel_ates:"🔥 Ateş Çıkışlı",ozel_roket:"🚀 Hızlı Yükseliş",ozel_onur:"🏅 Onur Madalyası",ozel_takim:"🤝 Takım Ruhu"}[a]||"🌱 Yeni"}window.assignBadge=async function(a,t){const e=[{key:"ozel_yildiz",icon:"🌟",name:"Yılın Yıldızı",desc:"En parlak performans"},{key:"ozel_ates",icon:"🔥",name:"Ateş Çıkışlı",desc:"Haftanın en iyisi"},{key:"ozel_roket",icon:"🚀",name:"Hızlı Yükseliş",desc:"En hızlı gelişim"},{key:"ozel_onur",icon:"🏅",name:"Onur Madalyası",desc:"Olağanüstü hizmet"},{key:"ozel_takim",icon:"🤝",name:"Takım Ruhu",desc:"Ekip çalışması"}],s=document.createElement("div");s.className="badge-modal-overlay",s.innerHTML=`
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
                </div>`,document.body.appendChild(s)};window.selectBadgeOption=function(a,t){document.querySelectorAll(".badge-option").forEach(e=>e.classList.remove("selected")),a.classList.add("selected"),a.closest(".badge-modal-overlay").__selectedBadge=t};window.saveBadgeAssignment=async function(a){const t=document.querySelector(".badge-modal-overlay"),e=t==null?void 0:t.__selectedBadge;if(!e){alert("Lütfen bir rozet seçin.");return}try{let s=e;if(e==="auto"){const{data:n}=await T.from("cashiers").select("total_points").eq("id",a).single(),l=(n==null?void 0:n.total_points)||0;l>=600?s="efsane_plus":l>=400?s="efsane":l>=250?s="elmas":l>=150?s="altin":l>=75?s="gumus":l>=30?s="bronz":s="yeni"}const{error:i}=await T.from("cashiers").update({badge_level:s}).eq("id",a);if(i)throw i;t.remove(),A(`✅ Rozet atandı: ${q(s)}`,"success"),await loadDashboard()}catch(s){console.error("Rozet atama hatası:",s),alert("❌ Hata: "+s.message)}};window.toggleDetails=function(){const a=document.getElementById("detailedSection"),t=document.getElementById("toggleIcon"),e=document.getElementById("toggleText");a&&(a.style.display==="none"?(a.style.display="block",t.textContent="🙈",e.textContent="Detaylı Verileri Gizle"):(a.style.display="none",t.textContent="👁️",e.textContent="Detaylı Verileri Göster"))};window.setDateFilter=function(a){v=a,R=null,I=null,document.querySelectorAll(".filter-btn").forEach(c=>c.classList.remove("active"));const t=document.querySelector(`[data-range="${a}"]`);t&&t.classList.add("active");const e=new Date,s=e.toLocaleDateString("tr-TR",{month:"long",year:"numeric"}),n=new Date(e.getFullYear(),e.getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"}),l={week:"Son 7 gün",month:`Bu Ay (${s})`,lastmonth:`Geçen Ay (${n})`,all:"Tüm veriler"},y=document.getElementById("filterInfo");y&&(y.textContent=l[a]||""),window.loadDashboard()};window.showDayPicker=function(){const a=document.createElement("div");a.className="custom-date-modal",a.style.display="flex",a.id="dayPickerModal",a.innerHTML=`
                <div class="custom-date-box">
                    <div class="custom-date-header">
                        <h3>📅 Belirli Gün Seçin</h3>
                        <button onclick="document.getElementById('dayPickerModal').remove()" class="close-btn">✕</button>
                    </div>
                    <div class="custom-date-content">
                        <div class="date-input-group">
                            <label>Tarih Seçin</label>
                            <input type="date" id="singleDayPicker" max="${$(new Date)}" />
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
            `,document.body.appendChild(a),document.getElementById("singleDayPicker").value=z||$(new Date)};window.applyDayFilter=function(){const a=document.getElementById("singleDayPicker"),t=a==null?void 0:a.value;if(!t){alert("⚠️ Lütfen bir tarih seçin!");return}z=t,v="day",R=null,I=null,document.querySelectorAll(".filter-btn").forEach(l=>l.classList.remove("active"));const e=document.querySelector('[data-range="day"]');e&&e.classList.add("active");const s=new Date(t).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}),i=document.getElementById("filterInfo");i&&(i.textContent=s);const n=document.getElementById("dayPickerModal");n&&n.remove(),window.loadDashboard()};window.showCustomDatePicker=function(){const a=document.getElementById("customDateModal"),t=$(new Date);if(document.getElementById("customStartDate").max=t,document.getElementById("customEndDate").max=t,R)document.getElementById("customStartDate").value=R;else{const e=new Date;e.setDate(e.getDate()-7),document.getElementById("customStartDate").value=$(e)}document.getElementById("customEndDate").value=I||t,a.style.display="flex"};window.closeCustomDatePicker=function(){document.getElementById("customDateModal").style.display="none"};window.applyCustomDateRange=function(){const a=document.getElementById("customStartDate").value,t=document.getElementById("customEndDate").value;if(!a||!t){alert("⚠️ Lütfen başlangıç ve bitiş tarihlerini seçin!");return}if(a>t){alert("⚠️ Başlangıç tarihi bitiş tarihinden sonra olamaz!");return}R=a,I=t,v="custom",document.querySelectorAll(".filter-btn").forEach(l=>l.classList.remove("active"));const e=document.querySelector('[data-range="custom"]');e&&e.classList.add("active");const s=new Date(a).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),i=new Date(t).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),n=document.getElementById("filterInfo");n&&(n.textContent=`${s} - ${i}`),window.closeCustomDatePicker(),window.loadDashboard()};window.loadDashboard=async function(){try{document.getElementById("mainContent").innerHTML=`
                    <div class="loading">
                        <div class="spinner"></div>
                        <div>Veriler yükleniyor...</div>
                    </div>
                `;const{weekly:a,reports:t,cashiers:e}=await W();P=t,await dt(a,t,e)}catch(a){console.error("Dashboard yükleme hatası:",a),document.getElementById("mainContent").innerHTML=`
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
            `,document.body.appendChild(t)};window.confirmDelete=async function(a){const t=document.querySelector(".modal-overlay");try{console.log("Siliniyor:",a);const{data:e,error:s}=await T.from("daily_reports").delete().eq("id",a);if(console.log("Delete response:",{data:e,error:s}),s)throw new Error(s.message);t&&t.remove(),A("✅ Kayıt başarıyla silindi!","success"),await loadDashboard()}catch(e){console.error("Silme hatası:",e),A("❌ Silme başarısız: "+e.message,"error"),t&&t.remove()}};window.editEntry=async function(a){console.log("editEntry çağrıldı:",a);const{data:t,error:e}=await T.from("daily_reports").select("*").eq("id",a).single();if(e){A("❌ Kayıt bulunamadı","error");return}const s=document.createElement("div");s.className="modal-overlay";const i=t.kasa==="cafetarya",n=t.kasa==="restoran";s.innerHTML=`
                <div class="modal-box" style="max-width:600px;">
                    <div class="modal-title">✏️ Kaydı Düzenle</div>
                    <div class="modal-content">
                        <div style="display:grid;gap:12px;">
                            <div style="background:var(--input);border-radius:8px;padding:10px;font-size:12px;color:var(--txt2);">
                                📅 ${t.date} · ${t.kasa} · ${t.shift==="sabah"?"🌅 Sabah":"🌙 Akşam"}
                            </div>
                            ${n?`
                            <div>
                                <label style="font-size:12px;color:var(--txt2);display:block;margin-bottom:4px;">🍽️ Rumeli Z2 (Restoran)</label>
                                <input type="number" id="editZ2" step="0.01" value="${parseFloat(t.rumeli_z2||0)}"
                                    style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--brd);background:var(--input);color:var(--txt);">
                            </div>`:""}
                            ${i?`
                            <div>
                                <label style="font-size:12px;color:var(--txt2);display:block;margin-bottom:4px;">☕ Rumeli Z1 (Cafetarya)</label>
                                <input type="number" id="editZ1" step="0.01" value="${parseFloat(t.rumeli_z1||0)}"
                                    style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--brd);background:var(--input);color:var(--txt);">
                            </div>
                            <div>
                                <label style="font-size:12px;color:var(--txt2);display:block;margin-bottom:4px;">🐟 Balık Ekmek</label>
                                <input type="number" id="editBalik" step="0.01" value="${parseFloat(t.balik_ekmek||0)}"
                                    style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--brd);background:var(--input);color:var(--txt);">
                            </div>
                            <div>
                                <label style="font-size:12px;color:var(--txt2);display:block;margin-bottom:4px;">🍦 Dondurma</label>
                                <input type="number" id="editDondurma" step="0.01" value="${parseFloat(t.dondurma||0)}"
                                    style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--brd);background:var(--input);color:var(--txt);">
                            </div>`:""}
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
                        <button class="modal-btn confirm" style="background:var(--acc);" onclick="confirmEdit('${a}', '${t.kasa}')">
                            Kaydet
                        </button>
                    </div>
                </div>
            `,document.body.appendChild(s)};window.confirmEdit=async function(a,t){const e=document.querySelector(".modal-overlay");try{const s=parseInt(document.getElementById("editPuan").value)||0,i=document.getElementById("editDurum").value==="true",n=document.getElementById("editZ1"),l=document.getElementById("editZ2"),y=document.getElementById("editBalik"),c=document.getElementById("editDondurma"),u=n?parseFloat(n.value)||0:null,b=l?parseFloat(l.value)||0:null,w=y?parseFloat(y.value)||0:null,f=c?parseFloat(c.value)||0:null,x=(u??0)+(b??0)+(w??0)+(f??0),h={points_earned:s,is_on_time:i,total_revenue:x};u!==null&&(h.rumeli_z1=u),b!==null&&(h.rumeli_z2=b),w!==null&&(h.balik_ekmek=w),f!==null&&(h.dondurma=f),console.log("Güncelleniyor:",{entryId:a,kasa:t,updatePayload:h});const{error:E}=await T.from("daily_reports").update(h).eq("id",a);if(E)throw E;const{data:F}=await T.from("daily_reports").select("cashier_id").eq("id",a).single();if(!F)throw new Error("Kayıt bulunamadı");const{data:k}=await T.from("daily_reports").select("points_earned").eq("cashier_id",F.cashier_id),_=k.reduce((r,p)=>r+(parseInt(p.points_earned)||0),0);console.log("Toplam puan:",_);let S="yeni";_>=1e3?S="efsane":_>=500?S="elmas":_>=300?S="altin":_>=150?S="gumus":_>=50&&(S="bronz");const{error:o}=await T.from("cashiers").update({total_points:_,badge_level:S}).eq("id",F.cashier_id);if(o)throw o;e&&e.remove(),A("✅ Kayıt ve kasiyer puanı güncellendi!","success"),await loadDashboard()}catch(s){console.error("Güncelleme hatası:",s),A("❌ Güncelleme başarısız: "+s.message,"error"),e&&e.remove()}};function A(a,t="success"){const e=document.createElement("div");e.style.cssText=`
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
