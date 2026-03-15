import"./modulepreload-polyfill-B5Qt9EMX.js";import{supabase as D}from"./supabase-client-CFSZQWn8.js";import"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";let u="month",E=null,_=null,x=null;function h(a){return a.getFullYear()+"-"+String(a.getMonth()+1).padStart(2,"0")+"-"+String(a.getDate()).padStart(2,"0")}async function W(){let a,t=null;const e=new Date;if(u==="day"&&x)a=x,t=x;else if(u==="custom"&&E&&_)a=E,t=_;else switch(u){case"week":const l=new Date;l.setDate(l.getDate()-7),a=h(l);break;case"month":a=h(new Date(e.getFullYear(),e.getMonth(),1)),t=h(new Date(e.getFullYear(),e.getMonth()+1,0));break;case"lastmonth":a=h(new Date(e.getFullYear(),e.getMonth()-1,1)),t=h(new Date(e.getFullYear(),e.getMonth(),0));break;case"all":a="2020-01-01";break;default:a=h(new Date(e.getFullYear(),e.getMonth(),1)),t=h(new Date(e.getFullYear(),e.getMonth()+1,0))}let s=D.from("daily_reports").select("*, cashiers(name)").gte("date",a).order("date",{ascending:!1});t&&(s=s.lte("date",t));const[i,n]=await Promise.all([s,D.from("cashiers").select("*").order("total_points",{ascending:!1})]);return{weekly:[],reports:i.data||[],cashiers:n.data||[]}}function U(a){const t={};return a.forEach(e=>{const s=`${e.date}-${e.kasa}`;(!t[s]||e.shift==="aksam")&&(t[s]=e)}),Object.values(t).reduce((e,s)=>(e.restoran+=parseFloat(s.rumeli_z2||0),e.cafetarya+=parseFloat(s.rumeli_z1||0),e.balik+=parseFloat(s.balik_ekmek||0),e.dondurma+=parseFloat(s.dondurma||0),e.total+=parseFloat(s.rumeli_z2||0)+parseFloat(s.rumeli_z1||0)+parseFloat(s.balik_ekmek||0)+parseFloat(s.dondurma||0),e),{restoran:0,cafetarya:0,balik:0,dondurma:0,total:0})}function K(a){const t={};a.forEach(i=>{const n=`${i.date}-${i.kasa}`;(!t[n]||i.shift==="aksam")&&(t[n]=i)});const e={};Object.values(t).forEach(i=>{const n=i.date;e[n]||(e[n]=0),e[n]+=parseFloat(i.rumeli_z2||0)+parseFloat(i.rumeli_z1||0)+parseFloat(i.balik_ekmek||0)+parseFloat(i.dondurma||0)});const s=Object.keys(e).sort();return{labels:s.map(i=>V(i)),data:s.map(i=>e[i])}}function Q(a){const t={sabah:0,aksam:0};return a.forEach(e=>{const s=parseFloat(e.individual_revenue||0);e.shift==="sabah"?t.sabah+=s:e.shift==="aksam"&&(t.aksam+=s)}),t}function J(a,t){const e={};return a.forEach(s=>{var n;const i=((n=s.cashiers)==null?void 0:n.name)||"Bilinmiyor";e[i]||(e[i]=0),e[i]+=parseFloat(s.individual_revenue||0)}),e}function X(a,t){const e=h(new Date),s=a.filter(m=>m.date===e),i=[...new Set(s.map(m=>m.cashier_id))],n=t.filter(m=>!i.includes(m.id)),l=a.filter(m=>!m.is_on_time),g=K(a),d=Math.max(...g.data,0);return{notEntered:n,lateEntries:l,maxCiro:d}}function tt(a){const t=K(a),e=Math.max(...t.data,0),s=h(new Date),i=a.filter(m=>m.date===s),l=[...new Set(i.map(m=>m.cashier_id))].length;return{maxDailyCiro:e,activeCashiers:l,avgEntryTime:"2.5dk",weeklyGrowth:"+12%"}}function at(){const a=new Date,t=a.getDay(),e=["2026-01-01","2026-04-23","2026-05-01","2026-05-19","2026-08-30","2026-10-29"],s=h(a);return e.includes(s)?"special":t===0||t===6?"weekend":"weekday"}async function et(){try{const a=at();console.log("Hedef tipi:",a);const{data:t,error:e}=await D.from("targets").select("amount").eq("target_type",a).single();return e?(console.error("Hedef çekme hatası:",e),{weekday:15e4,weekend:2e5,special:25e4}[a]):(console.log("Çekilen hedef:",t.amount),parseFloat(t.amount)||15e4)}catch(a){return console.error("fetchDailyTarget hatası:",a),15e4}}function it(){typeof anime>"u"||(anime({targets:".kasa-card, .sc, .total-hero-card",opacity:[0,1],translateY:[40,0],delay:anime.stagger(100),duration:800,easing:"easeOutCubic"}),anime({targets:".rank-card",opacity:[0,1],translateX:[-40,0],delay:anime.stagger(120),duration:700,easing:"easeOutCubic"}))}function st(){if(typeof anime>"u")return;const a=document.getElementById("totalDailyCiro"),t=parseFloat(a.getAttribute("data-value")||0);anime({targets:{value:0},value:t,duration:2e3,easing:"easeOutExpo",update:function(i){a.textContent=v(i.animations[0].currentValue)}});const e=document.getElementById("progressBarFill"),s=parseFloat(e.getAttribute("data-percent")||0);anime({targets:"#progressBarFill",width:s+"%",duration:1500,easing:"easeInOutQuad"})}function nt(a){const t={gida:{name:"Gıda",icon:"🥗",total:0,color:"#22c55e"},kahvalti:{name:"Kahvaltı",icon:"🥐",total:0,color:"#f59e0b"},kahve:{name:"Kahve",icon:"☕",total:0,color:"#8b5cf6"},meyvesuyu:{name:"Meyve Suyu",icon:"🧃",total:0,color:"#ec4899"},sicak_icecek:{name:"Sıcak İçecek",icon:"🔥",total:0,color:"#ef4444"},soguk_icecek:{name:"Soğuk İçecek",icon:"🥤",total:0,color:"#3b82f6"},tatli:{name:"Tatlı",icon:"🍰",total:0,color:"#a855f7"}},e={};a.forEach(n=>{const l=`${n.date}-${n.kasa}`;(!e[l]||n.shift==="aksam")&&(e[l]=n)}),Object.values(e).forEach(n=>{t.gida.total+=parseFloat(n.gida)||0,t.kahvalti.total+=parseFloat(n.kahvalti)||0,t.kahve.total+=parseFloat(n.kahve)||0,t.meyvesuyu.total+=parseFloat(n.meyvesuyu)||0,t.sicak_icecek.total+=parseFloat(n.sicak_icecek)||0,t.soguk_icecek.total+=parseFloat(n.soguk_icecek)||0,t.tatli.total+=parseFloat(n.tatli)||0});const s=Object.values(t).reduce((n,l)=>n+l.total,0);Object.values(t).forEach(n=>{n.percentage=s>0?n.total/s*100:0});const i=Object.entries(t).map(([n,l])=>({key:n,...l})).sort((n,l)=>l.total-n.total);return{categories:i,total:s,highest:i[0],lowest:i[i.length-1],average:s/i.length}}function ot(a){return a.categories.map(t=>`
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
            `).join("")}function lt(a){var e;const t=((e=a.categories[0])==null?void 0:e.total)||1;return a.categories.map(s=>{const i=t>0?s.total/t*100:0;return`
                    <div class="category-bar">
                        <div class="category-bar-label">${s.icon} ${s.name}</div>
                        <div class="category-bar-track">
                            <div class="category-bar-fill" style="width:${i}%;background:${s.color};">
                                ${A(s.total)}
                            </div>
                        </div>
                    </div>
                `}).join("")}function rt(a){return`
                <div class="category-summary-card">
                    <div class="summary-icon">🏆</div>
                    <div class="summary-label">En Çok Satan</div>
                    <div class="summary-value">${a.highest.icon} ${a.highest.name}</div>
                    <div style="font-size:12px;color:var(--acc);margin-top:4px;font-weight:600;">${A(a.highest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📉</div>
                    <div class="summary-label">En Az Satan</div>
                    <div class="summary-value">${a.lowest.icon} ${a.lowest.name}</div>
                    <div style="font-size:12px;color:var(--txt3);margin-top:4px;font-weight:600;">${A(a.lowest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📊</div>
                    <div class="summary-label">Kategori Ort.</div>
                    <div class="summary-value">${A(a.average)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">Kategori başına</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">💰</div>
                    <div class="summary-label">Kategori Toplamı</div>
                    <div class="summary-value">${A(a.total)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">7 kategori</div>
                </div>
            `}async function dt(a,t,e){const s=await et(),i=U(t),n=K(t),l=Q(t),g=J(t),d=X(t,e),m=tt(t),p=nt(t),b={};t.forEach(r=>{var F;const y=r.cashier_id,G=((F=r.cashiers)==null?void 0:F.name)||"Bilinmiyor";b[y]||(b[y]={name:G,points:0,entries:0,revenue:0}),b[y].points+=parseInt(r.points_earned)||0,b[y].entries+=1,b[y].revenue+=parseFloat(r.individual_revenue)||0});const f=Object.values(b).sort((r,y)=>y.points-r.points),k=f.length>0?f[0]:null,C=t.length,B=t.filter(r=>r.is_on_time).length,I=C>0?Math.round(B/C*100):0,w=[...new Set(t.map(r=>r.date))].length,L=w>0?i.total/w:0,o=i.total,c=u==="day"&&x?x:h(new Date),S={};t.filter(r=>r.date===c).forEach(r=>{const y=`${r.date}-${r.kasa}`;(!S[y]||r.shift==="aksam")&&(S[y]=r)});const R=Object.values(S).reduce((r,y)=>r+parseFloat(y.total_revenue||0),0),T=s>0?Math.min(100,Math.round(R/s*100)):0,M=u==="week"?"Bu Hafta":u==="month"?`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long"})})`:u==="lastmonth"?`Geçen Ay (${new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long"})})`:u==="all"?"Tüm Veriler":u==="day"&&x?new Date(x).toLocaleDateString("tr-TR",{day:"numeric",month:"short"}):E?`${new Date(E).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"})} - ${new Date(_).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"})}`:"Bu Ay";document.getElementById("mainContent").innerHTML=`

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
                    ${u==="week"?"Son 7 gün":u==="month"?`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`:u==="lastmonth"?`Geçen Ay (${new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`:u==="all"?"Tüm veriler":u==="day"&&x?new Date(x).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}):E?`${new Date(E).toLocaleDateString("tr-TR")} - ${new Date(_).toLocaleDateString("tr-TR")}`:`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`}
                </div>
            </div>

            <!-- GÜNLÜK TOPLAM HERO KARTI -->
            <div class="section-title">💰 Rumeli İskelesi Toplam Ciro</div>
            <div class="total-hero-card">
                <div class="total-hero-left">
                    <div class="total-hero-label">${u==="month"?"Bu Ay Toplam Ciro":u==="week"?"Bu Hafta Toplam Ciro":u==="day"?"Günlük Toplam Ciro":"Dönem Toplam Ciro"}</div>
                    <div class="total-hero-amount" id="totalDailyCiro" data-value="${o}">0,00 ₺</div>
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
                            <div class="progress-bar-fill" id="progressBarFill" style="width:0%" data-percent="${T}"></div>
                        </div>
                        <div class="progress-percent" id="progressPercent">Günlük Ort: ${v(w>0?(i.restoran+i.cafetarya)/w:0)}</div>
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
                    <div class="sc-s">${w} günlük veri</div>
                </div>
                <div class="sc purple">
                    <div class="sc-l">Günlük Ortalama (Tüm)</div>
                    <div class="sc-v">${v(L)}</div>
                    <div class="sc-s">Son ${w} gün</div>
                </div>
                <div class="sc emerald">
                    <div class="sc-l">🏢 Rumeli İskelesi Toplam</div>
                    <div class="sc-v">${v(i.restoran+i.cafetarya)}</div>
                    <div class="sc-s">Restoran + Cafetarya</div>
                </div>
                <div class="sc cyan">
                    <div class="sc-l">🏢 Rumeli İskelesi Günlük Ort.</div>
                    <div class="sc-v">${v(w>0?(i.restoran+i.cafetarya)/w:0)}</div>
                    <div class="sc-s">${w} günlük ortalama</div>
                </div>
                <div class="sc orange">
                    <div class="sc-l">Zamanında Giriş</div>
                    <div class="sc-v">%${I}</div>
                    <div class="sc-s">${B}/${C} giriş</div>
                </div>
                <div class="sc green">
                    <div class="sc-l">Toplam Giriş Sayısı</div>
                    <div class="sc-v">${C}</div>
                    <div class="sc-s">${w} günlük</div>
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
                ${ot(p)}
            </div>

            <!-- Kategori Grafikler + Özet -->
            <div class="category-charts">
                <div class="category-chart-box">
                    <div class="chart-title">📊 Kategori Karşılaştırması</div>
                    ${lt(p)}
                </div>
                <div class="category-chart-box">
                    <div class="chart-title">📋 Özet İstatistikler</div>
                    <div class="category-summary">
                        ${rt(p)}
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
                    <div class="chart-title">⚖️ Vardiya Karşılaştırması — ${M}</div>
                    <div class="chart-wrap">
                        <canvas id="shiftChart"></canvas>
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-title">👥 Kasiyer Ciro Performansı — ${M}</div>
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
                    ${d.lateEntries.length===0?'<div class="alert-item">Bu hafta geç giriş yok! 🎉</div>':d.lateEntries.slice(0,5).map(r=>{var y;return`
                            <div class="alert-item">
                                <span>${((y=r.cashiers)==null?void 0:y.name)||"Bilinmiyor"}</span>
                                <span style="color:var(--orange)">${j(r.entry_time)}</span>
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
                        <span style="color:var(--orange)">${a.reduce((r,y)=>r+(y.weekly_points||0),0)}</span>
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
                                ${P(t)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- KASİYER SIRALAMALARI -->
            <div class="section-title" style="margin-top:40px;">👥 Kasiyer Sıralaması <span style="font-size:13px;font-weight:500;color:var(--txt2);">(Bu Ay)</span></div>
            <div id="rankGrid" class="rank-grid">
                ${f.map((r,y)=>{const G=e.find(Z=>(Z.name||"")===r.name)||{},F=G.id||"",N=q(G.badge_level);return`
                    <div class="rank-card">
                        <div class="rank-pos p${Math.min(y+1,4)}">#${y+1}</div>
                        <div class="rank-avatar av-${pt(r.name)}">${yt(r.name)}</div>
                        <div class="rank-info">
                            <div class="rank-name">${r.name}</div>
                            <div class="rank-meta">
                                ${r.entries} giriş · ${v(r.revenue)} ciro
                            </div>
                        </div>
                        <div class="rank-right">
                            <div class="rank-pts">${r.points} puan</div>
                            <div class="rank-badge-pill">${N}</div>
                            ${F?`<button class="badge-assign-btn" onclick="assignBadge('${F}','${r.name}')">🎖️ Rozet Ver</button>`:""}
                        </div>
                    </div>`}).join("")}
            </div>

            <!-- AYIN ELEMANI HERO -->
            <div id="heroSection" class="hero ${k&&k.points>0?"gold":"blue"}" style="margin-top:24px;">
                <div class="hero-badge">🏆 AYIN ELEMANI</div>
                <div class="hero-name">${k?k.name:"Henüz Veri Yok"}</div>
                <div class="hero-amt">${k?k.points:0} Puan</div>
                <div class="hero-sub">
                    ${k?`${k.entries} giriş · ${v(k.revenue)}`:"İlk veriyi girin!"}
                </div>
            </div>
        `,ct(n,i,l,g);const Y=document.getElementById("applyFiltersBtn"),H=document.getElementById("clearFiltersBtn");Y&&Y.addEventListener("click",vt),H&&H.addEventListener("click",mt),document.getElementById("lastUpdate").textContent="Son güncelleme: "+new Date().toLocaleTimeString("tr-TR",{timeZone:"Europe/Istanbul"}),setTimeout(()=>{it(),st(),ut()},100),gt(s,R,T)}let $={};function ct(a,t,e,s){Chart.defaults.color="#7a8ba8",Chart.defaults.borderColor="#1e3a5f",Chart.defaults.font.family="DM Sans";const i=document.getElementById("dailyChart");i&&($.daily&&$.daily.destroy(),$.daily=new Chart(i,{type:"bar",data:{labels:a.labels.length>0?a.labels:["Veri Yok"],datasets:[{label:"Günlük Ciro (₺)",data:a.data.length>0?a.data:[0],backgroundColor:"rgba(59,130,246,.7)",borderColor:"#3b82f6",borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:d=>"₺"+new Intl.NumberFormat("tr-TR").format(d)}}}}}));const n=document.getElementById("kasaChart");if(n){$.kasa&&$.kasa.destroy();const d=t.total>0,m=d?[t.restoran,t.cafetarya,t.balik,t.dondurma]:[.001,.001,.001,.001];$.kasa=new Chart(n,{type:"doughnut",data:{labels:["Restoran","Cafetarya","Balık Ekmek","Dondurma"],datasets:[{data:m,backgroundColor:["rgba(59,130,246,.8)","rgba(139,92,246,.8)","rgba(6,182,212,.8)","rgba(236,72,153,.8)"],borderColor:"#111d32",borderWidth:3,hoverOffset:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{position:"bottom",labels:{padding:16,usePointStyle:!0}},tooltip:{enabled:d,callbacks:{label:p=>{const b=p.raw,f=p.dataset.data.reduce((C,B)=>C+B,0),k=Math.round(b/f*100);return` ${p.label}: ${v(b)} (%${k})`}}}},cutout:"65%"}})}const l=document.getElementById("shiftChart");l&&($.shift&&$.shift.destroy(),$.shift=new Chart(l,{type:"bar",data:{labels:["Sabah Vardiyası","Akşam Vardiyası"],datasets:[{label:"Ciro (₺)",data:[e.sabah||0,e.aksam||0],backgroundColor:["rgba(245,158,11,.7)","rgba(139,92,246,.7)"],borderColor:["#f59e0b","#8b5cf6"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:d=>"₺"+new Intl.NumberFormat("tr-TR").format(d)}}}}}));const g=document.getElementById("cashierChart");if(g){$.cashier&&$.cashier.destroy();const d=Object.keys(s),m=Object.values(s);$.cashier=new Chart(g,{type:"bar",data:{labels:d.length>0?d:["Veri Yok"],datasets:[{label:"Ciro (₺)",data:m.length>0?m:[0],backgroundColor:["rgba(139,92,246,.7)","rgba(245,158,11,.7)","rgba(236,72,153,.7)","rgba(34,197,94,.7)"],borderColor:["#8b5cf6","#f59e0b","#ec4899","#22c55e"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:p=>"₺"+new Intl.NumberFormat("tr-TR").format(p)}}}}})}}let O=[];function P(a){return a.length===0?'<tr><td colspan="9" style="text-align:center;color:var(--txt2);padding:40px;">Henüz veri yok</td></tr>':a.map(t=>{var i;const e=parseFloat(t.total_revenue||0),s=parseFloat(t.individual_revenue||e);return`
                <tr>
                    <td>${V(t.date)}</td>
                    <td style="font-weight:600">${((i=t.cashiers)==null?void 0:i.name)||"-"}</td>
                    <td><span class="badge ${t.kasa||""}">${t.kasa==="restoran"?"🍽️ Restoran":t.kasa==="cafetarya"?"☕ Cafetarya":"-"}</span></td>
                    <td><span class="badge ${t.shift||""}">${t.shift==="sabah"?"🌅 Sabah":t.shift==="aksam"?"🌙 Akşam":"-"}</span></td>
                    <td class="mono">${j(t.entry_time)}</td>
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
            `}).join("")}function vt(){const a=document.getElementById("filterDate").value,t=document.getElementById("filterKasiyer").value,e=document.getElementById("filterKasa").value,s=document.getElementById("filterVardiya").value;let i=[...O];a&&(i=i.filter(n=>n.date===a)),t&&(i=i.filter(n=>n.cashier_id===t)),e&&(i=i.filter(n=>n.kasa===e)),s&&(i=i.filter(n=>n.shift===s)),document.getElementById("entriesBody").innerHTML=P(i)}function mt(){document.getElementById("filterDate").value="",document.getElementById("filterKasiyer").value="",document.getElementById("filterKasa").value="",document.getElementById("filterVardiya").value="",document.getElementById("entriesBody").innerHTML=P(O)}function v(a){return new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(a||0)+" ₺"}function A(a){return v(a)}function ut(){document.querySelectorAll(".kasa-amount[data-target]").forEach(a=>{const t=parseFloat(a.dataset.target)||0,e=1200,s=performance.now();function i(n){const l=Math.min((n-s)/e,1),g=1-Math.pow(1-l,3);a.textContent=v(t*g),l<1?requestAnimationFrame(i):a.textContent=v(t)}requestAnimationFrame(i)})}function gt(a,t,e){const s=document.getElementById("floatingTarget");if(!s)return;s.style.display="block",document.getElementById("ftPct").textContent=e+"%",document.getElementById("ftTarget").textContent=v(a),document.getElementById("ftCurrent").textContent=v(t);const i=[[100,"🎉 Hedef Tamamlandı!"],[80,"💪 Hedefe Yakın!"],[50,"⏰ Yarı Yolda!"],[0,"🚀 Devam Edelim!"]];document.getElementById("ftStatus").textContent=(i.find(([l])=>e>=l)||i[3])[1];const n=document.getElementById("ftBar");n.classList.toggle("done",e>=100),n.classList.toggle("near",e>=80&&e<100),setTimeout(()=>{n.style.width=Math.min(100,e)+"%"},200)}window.showVerimlilik=async function(){document.getElementById("verimlilikModal").style.display="flex";const a=document.getElementById("verimlilikBody");a.innerHTML='<div class="loading" style="padding:40px 0;"><div class="spinner"></div><div>Veriler hesaplanıyor...</div></div>';try{const t=new Date,e=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-01`,s=new Date(t.getFullYear(),t.getMonth()+1,0).getDate(),i=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${s}`,{data:n}=await D.from("daily_reports").select("date, kasa, shift, rumeli_z1, rumeli_z2, balik_ekmek, dondurma").in("kasa",["restoran","cafetarya"]).gte("date",e).lte("date",i).order("date",{ascending:!0});if(!n||n.length===0){a.innerHTML='<div style="text-align:center;padding:40px;color:var(--txt2);">Bu ay için veri bulunamadı.</div>';return}const l={};n.forEach(o=>{const c=`${o.date}-${o.kasa}`;(!l[c]||o.shift==="aksam")&&(l[c]=o)});const g={};Object.values(l).forEach(o=>{g[o.date]||(g[o.date]={restoran:0,cafetarya:0,balik:0,dondurma:0}),o.kasa==="restoran"?g[o.date].restoran=parseFloat(o.rumeli_z2)||0:o.kasa==="cafetarya"&&(g[o.date].cafetarya=parseFloat(o.rumeli_z1)||0),g[o.date].balik+=parseFloat(o.balik_ekmek)||0,g[o.date].dondurma+=parseFloat(o.dondurma)||0});const d=Object.entries(g).map(([o,c])=>({date:o,total:(c.restoran||0)+(c.cafetarya||0)+(c.balik||0)+(c.dondurma||0),restoran:c.restoran||0,cafetarya:c.cafetarya||0,balik:c.balik||0,dondurma:c.dondurma||0})).sort((o,c)=>o.date.localeCompare(c.date)),m=d.reduce((o,c)=>o+c.total,0),p=d.length,b=p>0?m/p:0,f=d.reduce((o,c)=>c.total>o.total?c:o,d[0]),k=["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"],C={},B={};d.forEach(o=>{const[c,S,R]=o.date.split("-").map(Number),T=new Date(c,S-1,R).getDay();C[T]=(C[T]||0)+o.total,B[T]=(B[T]||0)+1});const I=[0,1,2,3,4,5,6].filter(o=>B[o]).map(o=>({name:k[o],avg:C[o]/B[o],idx:o})).sort((o,c)=>c.avg-o.avg),w=I.length>0?I[0].avg:1,L=t.toLocaleDateString("tr-TR",{month:"long",year:"numeric"});a.innerHTML=`
                    <div class="ver-stats-grid">
                        <div class="ver-stat-card">
                            <div class="ver-stat-label">🏢 Rumeli İskelesi Toplam</div>
                            <div class="ver-stat-value">${v(m)}</div>
                            <div class="ver-stat-sub">${L}</div>
                        </div>
                        <div class="ver-stat-card">
                            <div class="ver-stat-label">📅 Veri Günü</div>
                            <div class="ver-stat-value">${p} gün</div>
                            <div class="ver-stat-sub">Girişi olan günler</div>
                        </div>
                        <div class="ver-stat-card">
                            <div class="ver-stat-label">📊 Günlük Ortalama</div>
                            <div class="ver-stat-value">${v(b)}</div>
                            <div class="ver-stat-sub">Rest.+Cafe+Balık ortalaması</div>
                        </div>
                        <div class="ver-stat-card" style="border-color:var(--orange);">
                            <div class="ver-stat-label">🏆 En İyi Gün</div>
                            <div class="ver-stat-value">${v((f==null?void 0:f.total)||0)}</div>
                            <div class="ver-stat-sub">${f?(()=>{const[o,c,S]=f.date.split("-").map(Number);return new Date(o,c-1,S).toLocaleDateString("tr-TR",{day:"numeric",month:"long",weekday:"short"})})():"-"}</div>
                        </div>
                    </div>

                    <div class="ver-section-title">📈 Haftanın En İyi Günleri (Ortalamaya Göre)</div>
                    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px;">
                        ${I.map((o,c)=>`
                            <div style="display:flex;align-items:center;gap:12px;">
                                <div style="width:20px;text-align:right;font-size:12px;color:var(--txt2);">${c+1}.</div>
                                <div style="width:90px;font-size:13px;font-weight:600;">${o.name}</div>
                                <div style="flex:1;height:8px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;">
                                    <div style="height:100%;width:${Math.round(o.avg/w*100)}%;background:linear-gradient(90deg,${c===0?"#f59e0b,#f97316":"#3b82f6,#06b6d4"});border-radius:4px;transition:width 1s ease;"></div>
                                </div>
                                <div style="width:130px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;color:${c===0?"var(--orange)":"var(--txt)"};">${v(o.avg)}</div>
                            </div>
                        `).join("")}
                    </div>

                    <div class="ver-section-title">📋 Günlük Ciro Detayı — ${L}</div>
                    <div style="max-height:320px;overflow-y:auto;border-radius:10px;border:1px solid var(--brd);">
                        <table class="ver-daily-table">
                            <thead>
                                <tr>
                                    <th>Tarih</th>
                                    <th>Gün</th>
                                    <th>Restoran</th>
                                    <th>Cafetarya</th>
                                    <th>🐟 Balık</th>
                                    <th>Toplam</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${d.map(o=>{const c=o.date===(f==null?void 0:f.date),[S,R,T]=o.date.split("-").map(Number),M=new Date(S,R-1,T).toLocaleDateString("tr-TR",{weekday:"short"});return`<tr${c?' class="top-row"':""}>
                                        <td>${String(T).padStart(2,"0")+"/"+String(R).padStart(2,"0")}</td>
                                        <td style="color:var(--txt2);font-family:sans-serif;font-size:12px;">${M}</td>
                                        <td>${v(o.restoran)}</td>
                                        <td>${v(o.cafetarya)}</td>
                                        <td style="color:var(--cyan);">${o.balik>0?v(o.balik):"-"}</td>
                                        <td style="font-weight:700;${c?"color:var(--orange);":""}">${v(o.total)}</td>
                                    </tr>`}).join("")}
                            </tbody>
                        </table>
                    </div>
                `}catch(t){a.innerHTML=`<div style="text-align:center;padding:40px;color:var(--red);">⚠️ Veri yüklenirken hata: ${t.message}</div>`}};window.closeVerimlilik=function(){document.getElementById("verimlilikModal").style.display="none"};document.getElementById("verimlilikModal").addEventListener("click",function(a){a.target===this&&closeVerimlilik()});function V(a){if(!a)return"-";const t=a.split("T")[0].split("-");return t.length===3?t[2]+"."+t[1]:a}function j(a){return a?new Date(a).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"}):"-"}function yt(a){return a?a.split(" ").map(t=>t[0]).join(""):"??"}function pt(a){if(!a)return"t";const t=a.split(" ")[0];return{Tuba:"t",Elif:"e",Melda:"m",Ceren:"c"}[t]||"t"}function q(a){return{yeni:"🌱 Yeni",bronz:"🥉 Bronz",gumus:"🥈 Gümüş",altin:"🥇 Altın",elmas:"💎 Elmas",efsane:"👑 Efsane",efsane_plus:"👑⭐ Süper Efsane",ozel_yildiz:"🌟 Yılın Yıldızı",ozel_ates:"🔥 Ateş Çıkışlı",ozel_roket:"🚀 Hızlı Yükseliş",ozel_onur:"🏅 Onur Madalyası",ozel_takim:"🤝 Takım Ruhu"}[a]||"🌱 Yeni"}window.assignBadge=async function(a,t){const e=[{key:"ozel_yildiz",icon:"🌟",name:"Yılın Yıldızı",desc:"En parlak performans"},{key:"ozel_ates",icon:"🔥",name:"Ateş Çıkışlı",desc:"Haftanın en iyisi"},{key:"ozel_roket",icon:"🚀",name:"Hızlı Yükseliş",desc:"En hızlı gelişim"},{key:"ozel_onur",icon:"🏅",name:"Onur Madalyası",desc:"Olağanüstü hizmet"},{key:"ozel_takim",icon:"🤝",name:"Takım Ruhu",desc:"Ekip çalışması"}],s=document.createElement("div");s.className="badge-modal-overlay",s.innerHTML=`
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
                </div>`,document.body.appendChild(s)};window.selectBadgeOption=function(a,t){document.querySelectorAll(".badge-option").forEach(e=>e.classList.remove("selected")),a.classList.add("selected"),a.closest(".badge-modal-overlay").__selectedBadge=t};window.saveBadgeAssignment=async function(a){const t=document.querySelector(".badge-modal-overlay"),e=t==null?void 0:t.__selectedBadge;if(!e){alert("Lütfen bir rozet seçin.");return}try{let s=e;if(e==="auto"){const{data:n}=await D.from("cashiers").select("total_points").eq("id",a).single(),l=(n==null?void 0:n.total_points)||0;l>=600?s="efsane_plus":l>=400?s="efsane":l>=250?s="elmas":l>=150?s="altin":l>=75?s="gumus":l>=30?s="bronz":s="yeni"}const{error:i}=await D.from("cashiers").update({badge_level:s}).eq("id",a);if(i)throw i;t.remove(),z(`✅ Rozet atandı: ${q(s)}`,"success"),await loadDashboard()}catch(s){console.error("Rozet atama hatası:",s),alert("❌ Hata: "+s.message)}};window.toggleDetails=function(){const a=document.getElementById("detailedSection"),t=document.getElementById("toggleIcon"),e=document.getElementById("toggleText");a&&(a.style.display==="none"?(a.style.display="block",t.textContent="🙈",e.textContent="Detaylı Verileri Gizle"):(a.style.display="none",t.textContent="👁️",e.textContent="Detaylı Verileri Göster"))};window.setDateFilter=function(a){u=a,E=null,_=null,document.querySelectorAll(".filter-btn").forEach(d=>d.classList.remove("active"));const t=document.querySelector(`[data-range="${a}"]`);t&&t.classList.add("active");const e=new Date,s=e.toLocaleDateString("tr-TR",{month:"long",year:"numeric"}),n=new Date(e.getFullYear(),e.getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"}),l={week:"Son 7 gün",month:`Bu Ay (${s})`,lastmonth:`Geçen Ay (${n})`,all:"Tüm veriler"},g=document.getElementById("filterInfo");g&&(g.textContent=l[a]||""),window.loadDashboard()};window.showDayPicker=function(){const a=document.createElement("div");a.className="custom-date-modal",a.style.display="flex",a.id="dayPickerModal",a.innerHTML=`
                <div class="custom-date-box">
                    <div class="custom-date-header">
                        <h3>📅 Belirli Gün Seçin</h3>
                        <button onclick="document.getElementById('dayPickerModal').remove()" class="close-btn">✕</button>
                    </div>
                    <div class="custom-date-content">
                        <div class="date-input-group">
                            <label>Tarih Seçin</label>
                            <input type="date" id="singleDayPicker" max="${h(new Date)}" />
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
            `,document.body.appendChild(a),document.getElementById("singleDayPicker").value=x||h(new Date)};window.applyDayFilter=function(){const a=document.getElementById("singleDayPicker"),t=a==null?void 0:a.value;if(!t){alert("⚠️ Lütfen bir tarih seçin!");return}x=t,u="day",E=null,_=null,document.querySelectorAll(".filter-btn").forEach(l=>l.classList.remove("active"));const e=document.querySelector('[data-range="day"]');e&&e.classList.add("active");const s=new Date(t).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}),i=document.getElementById("filterInfo");i&&(i.textContent=s);const n=document.getElementById("dayPickerModal");n&&n.remove(),window.loadDashboard()};window.showCustomDatePicker=function(){const a=document.getElementById("customDateModal"),t=h(new Date);if(document.getElementById("customStartDate").max=t,document.getElementById("customEndDate").max=t,E)document.getElementById("customStartDate").value=E;else{const e=new Date;e.setDate(e.getDate()-7),document.getElementById("customStartDate").value=h(e)}document.getElementById("customEndDate").value=_||t,a.style.display="flex"};window.closeCustomDatePicker=function(){document.getElementById("customDateModal").style.display="none"};window.applyCustomDateRange=function(){const a=document.getElementById("customStartDate").value,t=document.getElementById("customEndDate").value;if(!a||!t){alert("⚠️ Lütfen başlangıç ve bitiş tarihlerini seçin!");return}if(a>t){alert("⚠️ Başlangıç tarihi bitiş tarihinden sonra olamaz!");return}E=a,_=t,u="custom",document.querySelectorAll(".filter-btn").forEach(l=>l.classList.remove("active"));const e=document.querySelector('[data-range="custom"]');e&&e.classList.add("active");const s=new Date(a).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),i=new Date(t).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),n=document.getElementById("filterInfo");n&&(n.textContent=`${s} - ${i}`),window.closeCustomDatePicker(),window.loadDashboard()};window.loadDashboard=async function(){try{document.getElementById("mainContent").innerHTML=`
                    <div class="loading">
                        <div class="spinner"></div>
                        <div>Veriler yükleniyor...</div>
                    </div>
                `;const{weekly:a,reports:t,cashiers:e}=await W();O=t,await dt(a,t,e)}catch(a){console.error("Dashboard yükleme hatası:",a),document.getElementById("mainContent").innerHTML=`
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
            `,document.body.appendChild(t)};window.confirmDelete=async function(a){const t=document.querySelector(".modal-overlay");try{console.log("Siliniyor:",a);const{data:e,error:s}=await D.from("daily_reports").delete().eq("id",a);if(console.log("Delete response:",{data:e,error:s}),s)throw new Error(s.message);t&&t.remove(),z("✅ Kayıt başarıyla silindi!","success"),await loadDashboard()}catch(e){console.error("Silme hatası:",e),z("❌ Silme başarısız: "+e.message,"error"),t&&t.remove()}};window.editEntry=async function(a){console.log("editEntry çağrıldı:",a);const{data:t,error:e}=await D.from("daily_reports").select("*").eq("id",a).single();if(e){z("❌ Kayıt bulunamadı","error");return}const s=document.createElement("div");s.className="modal-overlay",s.innerHTML=`
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
            `,document.body.appendChild(s)};window.confirmEdit=async function(a){const t=document.querySelector(".modal-overlay");try{const e=parseFloat(document.getElementById("editZCiro").value)||0,s=parseInt(document.getElementById("editPuan").value)||0,i=document.getElementById("editDurum").value==="true";console.log("Güncelleniyor:",{entryId:a,newZCiro:e,newPuan:s,newDurum:i});const{error:n}=await D.from("daily_reports").update({total_revenue:e,points_earned:s,is_on_time:i}).eq("id",a);if(n)throw n;const{data:l}=await D.from("daily_reports").select("cashier_id").eq("id",a).single();if(!l)throw new Error("Kayıt bulunamadı");const{data:g}=await D.from("daily_reports").select("points_earned").eq("cashier_id",l.cashier_id),d=g.reduce((b,f)=>b+(parseInt(f.points_earned)||0),0);console.log("Toplam puan:",d);let m="yeni";d>=1e3?m="efsane":d>=500?m="elmas":d>=300?m="altin":d>=150?m="gumus":d>=50&&(m="bronz");const{error:p}=await D.from("cashiers").update({total_points:d,badge_level:m}).eq("id",l.cashier_id);if(p)throw p;t&&t.remove(),z("✅ Kayıt ve kasiyer puanı güncellendi!","success"),await loadDashboard()}catch(e){console.error("Güncelleme hatası:",e),z("❌ Güncelleme başarısız: "+e.message,"error"),t&&t.remove()}};function z(a,t="success"){const e=document.createElement("div");e.style.cssText=`
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
