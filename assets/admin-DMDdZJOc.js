import"./modulepreload-polyfill-B5Qt9EMX.js";import{supabase as x}from"./supabase-client-CFSZQWn8.js";import"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";let u="month",T=null,R=null,C=null;function h(e){return e.getFullYear()+"-"+String(e.getMonth()+1).padStart(2,"0")+"-"+String(e.getDate()).padStart(2,"0")}async function W(){let e,t=null;const a=new Date;if(u==="day"&&C)e=C,t=C;else if(u==="custom"&&T&&R)e=T,t=R;else switch(u){case"week":const l=new Date;l.setDate(l.getDate()-7),e=h(l);break;case"month":e=h(new Date(a.getFullYear(),a.getMonth(),1)),t=h(new Date(a.getFullYear(),a.getMonth()+1,0));break;case"lastmonth":e=h(new Date(a.getFullYear(),a.getMonth()-1,1)),t=h(new Date(a.getFullYear(),a.getMonth(),0));break;case"all":e="2020-01-01";break;default:e=h(new Date(a.getFullYear(),a.getMonth(),1)),t=h(new Date(a.getFullYear(),a.getMonth()+1,0))}let s=x.from("daily_reports").select("*, cashiers(name)").gte("date",e).order("date",{ascending:!1});t&&(s=s.lte("date",t));const[i,n]=await Promise.all([s,x.from("cashiers").select("*").order("total_points",{ascending:!1})]);return{weekly:[],reports:i.data||[],cashiers:n.data||[]}}function U(e){const t={};return e.forEach(a=>{const s=`${a.date}-${a.kasa}`;(!t[s]||a.shift==="aksam")&&(t[s]=a)}),Object.values(t).reduce((a,s)=>(a.restoran+=parseFloat(s.rumeli_z2||0),a.cafetarya+=parseFloat(s.rumeli_z1||0),a.balik+=parseFloat(s.balik_ekmek||0),a.dondurma+=parseFloat(s.dondurma||0),a.total+=parseFloat(s.rumeli_z2||0)+parseFloat(s.rumeli_z1||0)+parseFloat(s.balik_ekmek||0)+parseFloat(s.dondurma||0),a),{restoran:0,cafetarya:0,balik:0,dondurma:0,total:0})}function O(e){const t={};e.forEach(i=>{const n=`${i.date}-${i.kasa}`;(!t[n]||i.shift==="aksam")&&(t[n]=i)});const a={};Object.values(t).forEach(i=>{const n=i.date;a[n]||(a[n]=0),a[n]+=parseFloat(i.rumeli_z2||0)+parseFloat(i.rumeli_z1||0)+parseFloat(i.balik_ekmek||0)+parseFloat(i.dondurma||0)});const s=Object.keys(a).sort();return{labels:s.map(i=>V(i)),data:s.map(i=>a[i])}}function Q(e){const t={sabah:0,aksam:0};return e.forEach(a=>{const s=parseFloat(a.individual_revenue||0);a.shift==="sabah"?t.sabah+=s:a.shift==="aksam"&&(t.aksam+=s)}),t}function J(e,t){const a={};return e.forEach(s=>{var n;const i=((n=s.cashiers)==null?void 0:n.name)||"Bilinmiyor";a[i]||(a[i]=0),a[i]+=parseFloat(s.individual_revenue||0)}),a}function X(e,t){const a=h(new Date),s=e.filter(m=>m.date===a),i=[...new Set(s.map(m=>m.cashier_id))],n=t.filter(m=>!i.includes(m.id)),l=e.filter(m=>!m.is_on_time),y=O(e),d=Math.max(...y.data,0);return{notEntered:n,lateEntries:l,maxCiro:d}}function tt(e){const t=O(e),a=Math.max(...t.data,0),s=h(new Date),i=e.filter(m=>m.date===s),l=[...new Set(i.map(m=>m.cashier_id))].length;return{maxDailyCiro:a,activeCashiers:l,avgEntryTime:"2.5dk",weeklyGrowth:"+12%"}}function et(){const e=new Date,t=e.getDay(),a=["2026-01-01","2026-04-23","2026-05-01","2026-05-19","2026-08-30","2026-10-29"],s=h(e);return a.includes(s)?"special":t===0||t===6?"weekend":"weekday"}async function at(){try{const e=et();console.log("Hedef tipi:",e);const{data:t,error:a}=await x.from("targets").select("amount").eq("target_type",e).single();return a?(console.error("Hedef çekme hatası:",a),{weekday:15e4,weekend:2e5,special:25e4}[e]):(console.log("Çekilen hedef:",t.amount),parseFloat(t.amount)||15e4)}catch(e){return console.error("fetchDailyTarget hatası:",e),15e4}}function it(){typeof anime>"u"||(anime({targets:".kasa-card, .sc, .total-hero-card",opacity:[0,1],translateY:[40,0],delay:anime.stagger(100),duration:800,easing:"easeOutCubic"}),anime({targets:".rank-card",opacity:[0,1],translateX:[-40,0],delay:anime.stagger(120),duration:700,easing:"easeOutCubic"}))}function st(){if(typeof anime>"u")return;const e=document.getElementById("totalDailyCiro"),t=parseFloat(e.getAttribute("data-value")||0);anime({targets:{value:0},value:t,duration:2e3,easing:"easeOutExpo",update:function(i){e.textContent=v(i.animations[0].currentValue)}});const a=document.getElementById("progressBarFill"),s=parseFloat(a.getAttribute("data-percent")||0);anime({targets:"#progressBarFill",width:s+"%",duration:1500,easing:"easeInOutQuad"})}function nt(e){const t={gida:{name:"Gıda",icon:"🥗",total:0,color:"#22c55e"},kahvalti:{name:"Kahvaltı",icon:"🥐",total:0,color:"#f59e0b"},kahve:{name:"Kahve",icon:"☕",total:0,color:"#8b5cf6"},meyvesuyu:{name:"Meyve Suyu",icon:"🧃",total:0,color:"#ec4899"},sicak_icecek:{name:"Sıcak İçecek",icon:"🔥",total:0,color:"#ef4444"},soguk_icecek:{name:"Soğuk İçecek",icon:"🥤",total:0,color:"#3b82f6"},tatli:{name:"Tatlı",icon:"🍰",total:0,color:"#a855f7"}},a={};e.forEach(n=>{const l=`${n.date}-${n.kasa}`;(!a[l]||n.shift==="aksam")&&(a[l]=n)}),Object.values(a).forEach(n=>{t.gida.total+=parseFloat(n.gida)||0,t.kahvalti.total+=parseFloat(n.kahvalti)||0,t.kahve.total+=parseFloat(n.kahve)||0,t.meyvesuyu.total+=parseFloat(n.meyvesuyu)||0,t.sicak_icecek.total+=parseFloat(n.sicak_icecek)||0,t.soguk_icecek.total+=parseFloat(n.soguk_icecek)||0,t.tatli.total+=parseFloat(n.tatli)||0});const s=Object.values(t).reduce((n,l)=>n+l.total,0);Object.values(t).forEach(n=>{n.percentage=s>0?n.total/s*100:0});const i=Object.entries(t).map(([n,l])=>({key:n,...l})).sort((n,l)=>l.total-n.total);return{categories:i,total:s,highest:i[0],lowest:i[i.length-1],average:s/i.length}}function ot(e){return e.categories.map(t=>`
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
            `).join("")}function lt(e){var a;const t=((a=e.categories[0])==null?void 0:a.total)||1;return e.categories.map(s=>{const i=t>0?s.total/t*100:0;return`
                    <div class="category-bar">
                        <div class="category-bar-label">${s.icon} ${s.name}</div>
                        <div class="category-bar-track">
                            <div class="category-bar-fill" style="width:${i}%;background:${s.color};">
                                ${F(s.total)}
                            </div>
                        </div>
                    </div>
                `}).join("")}function rt(e){return`
                <div class="category-summary-card">
                    <div class="summary-icon">🏆</div>
                    <div class="summary-label">En Çok Satan</div>
                    <div class="summary-value">${e.highest.icon} ${e.highest.name}</div>
                    <div style="font-size:12px;color:var(--acc);margin-top:4px;font-weight:600;">${F(e.highest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📉</div>
                    <div class="summary-label">En Az Satan</div>
                    <div class="summary-value">${e.lowest.icon} ${e.lowest.name}</div>
                    <div style="font-size:12px;color:var(--txt3);margin-top:4px;font-weight:600;">${F(e.lowest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📊</div>
                    <div class="summary-label">Kategori Ort.</div>
                    <div class="summary-value">${F(e.average)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">Kategori başına</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">💰</div>
                    <div class="summary-label">Kategori Toplamı</div>
                    <div class="summary-value">${F(e.total)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">7 kategori</div>
                </div>
            `}async function dt(e,t,a){const s=await at(),i=U(t),n=O(t),l=Q(t),y=J(t),d=X(t,a),m=tt(t),p=nt(t),k={};t.forEach(r=>{var A;const g=r.cashier_id,G=((A=r.cashiers)==null?void 0:A.name)||"Bilinmiyor";k[g]||(k[g]={name:G,points:0,entries:0,revenue:0}),k[g].points+=parseInt(r.points_earned)||0,k[g].entries+=1,k[g].revenue+=parseFloat(r.individual_revenue)||0});const f=Object.values(k).sort((r,g)=>g.points-r.points),w=f.length>0?f[0]:null,B=t.length,_=t.filter(r=>r.is_on_time).length,I=B>0?Math.round(_/B*100):0,b=[...new Set(t.map(r=>r.date))].length,K=b>0?i.total/b:0,L=i.total,o=u==="day"&&C?C:h(new Date),c={};t.filter(r=>r.date===o).forEach(r=>{const g=`${r.date}-${r.kasa}`;(!c[g]||r.shift==="aksam")&&(c[g]=r)});const E=Object.values(c).reduce((r,g)=>r+parseFloat(g.total_revenue||0),0),S=s>0?Math.min(100,Math.round(E/s*100)):0,$=u==="week"?"Bu Hafta":u==="month"?`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long"})})`:u==="lastmonth"?`Geçen Ay (${new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long"})})`:u==="all"?"Tüm Veriler":u==="day"&&C?new Date(C).toLocaleDateString("tr-TR",{day:"numeric",month:"short"}):T?`${new Date(T).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"})} - ${new Date(R).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"})}`:"Bu Ay";document.getElementById("mainContent").innerHTML=`

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
                    ${u==="week"?"Son 7 gün":u==="month"?`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`:u==="lastmonth"?`Geçen Ay (${new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`:u==="all"?"Tüm veriler":u==="day"&&C?new Date(C).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}):T?`${new Date(T).toLocaleDateString("tr-TR")} - ${new Date(R).toLocaleDateString("tr-TR")}`:`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`}
                </div>
            </div>

            <!-- GÜNLÜK TOPLAM HERO KARTI -->
            <div class="section-title">💰 Rumeli İskelesi Toplam Ciro</div>
            <div class="total-hero-card">
                <div class="total-hero-left">
                    <div class="total-hero-label">${u==="month"?"Bu Ay Toplam Ciro":u==="week"?"Bu Hafta Toplam Ciro":u==="day"?"Günlük Toplam Ciro":"Dönem Toplam Ciro"}</div>
                    <div class="total-hero-amount" id="totalDailyCiro" data-value="${L}">0,00 ₺</div>
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
                            <div class="progress-bar-fill" id="progressBarFill" style="width:0%" data-percent="${S}"></div>
                        </div>
                        <div class="progress-percent" id="progressPercent">Günlük Ort: ${v(b>0?(i.restoran+i.cafetarya)/b:0)}</div>
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
                    <div class="sc-s">${b} günlük veri</div>
                </div>
                <div class="sc purple">
                    <div class="sc-l">Günlük Ortalama (Tüm)</div>
                    <div class="sc-v">${v(K)}</div>
                    <div class="sc-s">Son ${b} gün</div>
                </div>
                <div class="sc emerald">
                    <div class="sc-l">🏢 Rumeli İskelesi Toplam</div>
                    <div class="sc-v">${v(i.restoran+i.cafetarya)}</div>
                    <div class="sc-s">Restoran + Cafetarya</div>
                </div>
                <div class="sc cyan">
                    <div class="sc-l">🏢 Rumeli İskelesi Günlük Ort.</div>
                    <div class="sc-v">${v(b>0?(i.restoran+i.cafetarya)/b:0)}</div>
                    <div class="sc-s">${b} günlük ortalama</div>
                </div>
                <div class="sc orange">
                    <div class="sc-l">Zamanında Giriş</div>
                    <div class="sc-v">%${I}</div>
                    <div class="sc-s">${_}/${B} giriş</div>
                </div>
                <div class="sc green">
                    <div class="sc-l">Toplam Giriş Sayısı</div>
                    <div class="sc-v">${B}</div>
                    <div class="sc-s">${b} günlük</div>
                </div>
                <div class="sc pink">
                    <div class="sc-l">En Yüksek Günlük Ciro</div>
                    <div class="sc-v" id="maxDailyCiro">${v(m.maxDailyCiro)}</div>
                    <div class="sc-s">Dönem rekoru</div>
                </div>
                <div class="sc indigo">
                    <div class="sc-l">Aktif Kasiyer</div>
                    <div class="sc-v" id="activeCashiers">${m.activeCashiers}/${a.length}</div>
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
                    <div class="chart-title">⚖️ Vardiya Karşılaştırması — ${$}</div>
                    <div class="chart-wrap">
                        <canvas id="shiftChart"></canvas>
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-title">👥 Kasiyer Ciro Performansı — ${$}</div>
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
                        <span style="color:var(--orange)">${e.reduce((r,g)=>r+(g.weekly_points||0),0)}</span>
                    </div>
                    <div class="alert-item">
                        <span>Aktif Kasiyer</span>
                        <span style="color:var(--green)">${e.filter(r=>(r.total_entries||0)>0).length}/${a.length}</span>
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
                            ${a.map(r=>`<option value="${r.id}">${r.name}</option>`).join("")}
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
                ${f.map((r,g)=>{const G=a.find(Z=>(Z.name||"")===r.name)||{},A=G.id||"",N=q(G.badge_level);return`
                    <div class="rank-card">
                        <div class="rank-pos p${Math.min(g+1,4)}">#${g+1}</div>
                        <div class="rank-avatar av-${pt(r.name)}">${gt(r.name)}</div>
                        <div class="rank-info">
                            <div class="rank-name">${r.name}</div>
                            <div class="rank-meta">
                                ${r.entries} giriş · ${v(r.revenue)} ciro
                            </div>
                        </div>
                        <div class="rank-right">
                            <div class="rank-pts">${r.points} puan</div>
                            <div class="rank-badge-pill">${N}</div>
                            ${A?`<button class="badge-assign-btn" onclick="assignBadge('${A}','${r.name}')">🎖️ Rozet Ver</button>`:""}
                        </div>
                    </div>`}).join("")}
            </div>

            <!-- AYIN ELEMANI HERO -->
            <div id="heroSection" class="hero ${w&&w.points>0?"gold":"blue"}" style="margin-top:24px;">
                <div class="hero-badge">🏆 AYIN ELEMANI</div>
                <div class="hero-name">${w?w.name:"Henüz Veri Yok"}</div>
                <div class="hero-amt">${w?w.points:0} Puan</div>
                <div class="hero-sub">
                    ${w?`${w.entries} giriş · ${v(w.revenue)}`:"İlk veriyi girin!"}
                </div>
            </div>
        `,ct(n,i,l,y);const M=document.getElementById("applyFiltersBtn"),H=document.getElementById("clearFiltersBtn");M&&M.addEventListener("click",vt),H&&H.addEventListener("click",mt),document.getElementById("lastUpdate").textContent="Son güncelleme: "+new Date().toLocaleTimeString("tr-TR",{timeZone:"Europe/Istanbul"}),setTimeout(()=>{it(),st(),ut()},100),yt(s,E,S)}let D={};function ct(e,t,a,s){Chart.defaults.color="#7a8ba8",Chart.defaults.borderColor="#1e3a5f",Chart.defaults.font.family="DM Sans";const i=document.getElementById("dailyChart");i&&(D.daily&&D.daily.destroy(),D.daily=new Chart(i,{type:"bar",data:{labels:e.labels.length>0?e.labels:["Veri Yok"],datasets:[{label:"Günlük Ciro (₺)",data:e.data.length>0?e.data:[0],backgroundColor:"rgba(59,130,246,.7)",borderColor:"#3b82f6",borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:d=>"₺"+new Intl.NumberFormat("tr-TR").format(d)}}}}}));const n=document.getElementById("kasaChart");if(n){D.kasa&&D.kasa.destroy();const d=t.total>0,m=d?[t.restoran,t.cafetarya,t.balik,t.dondurma]:[.001,.001,.001,.001];D.kasa=new Chart(n,{type:"doughnut",data:{labels:["Restoran","Cafetarya","Balık Ekmek","Dondurma"],datasets:[{data:m,backgroundColor:["rgba(59,130,246,.8)","rgba(139,92,246,.8)","rgba(6,182,212,.8)","rgba(236,72,153,.8)"],borderColor:"#111d32",borderWidth:3,hoverOffset:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{position:"bottom",labels:{padding:16,usePointStyle:!0}},tooltip:{enabled:d,callbacks:{label:p=>{const k=p.raw,f=p.dataset.data.reduce((B,_)=>B+_,0),w=Math.round(k/f*100);return` ${p.label}: ${v(k)} (%${w})`}}}},cutout:"65%"}})}const l=document.getElementById("shiftChart");l&&(D.shift&&D.shift.destroy(),D.shift=new Chart(l,{type:"bar",data:{labels:["Sabah Vardiyası","Akşam Vardiyası"],datasets:[{label:"Ciro (₺)",data:[a.sabah||0,a.aksam||0],backgroundColor:["rgba(245,158,11,.7)","rgba(139,92,246,.7)"],borderColor:["#f59e0b","#8b5cf6"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:d=>"₺"+new Intl.NumberFormat("tr-TR").format(d)}}}}}));const y=document.getElementById("cashierChart");if(y){D.cashier&&D.cashier.destroy();const d=Object.keys(s),m=Object.values(s);D.cashier=new Chart(y,{type:"bar",data:{labels:d.length>0?d:["Veri Yok"],datasets:[{label:"Ciro (₺)",data:m.length>0?m:[0],backgroundColor:["rgba(139,92,246,.7)","rgba(245,158,11,.7)","rgba(236,72,153,.7)","rgba(34,197,94,.7)"],borderColor:["#8b5cf6","#f59e0b","#ec4899","#22c55e"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:p=>"₺"+new Intl.NumberFormat("tr-TR").format(p)}}}}})}}let P=[];function Y(e){return e.length===0?'<tr><td colspan="9" style="text-align:center;color:var(--txt2);padding:40px;">Henüz veri yok</td></tr>':e.map(t=>{var i;const a=parseFloat(t.total_revenue||0),s=parseFloat(t.individual_revenue||a);return`
                <tr>
                    <td>${V(t.date)}</td>
                    <td style="font-weight:600">${((i=t.cashiers)==null?void 0:i.name)||"-"}</td>
                    <td><span class="badge ${t.kasa||""}">${t.kasa==="restoran"?"🍽️ Restoran":t.kasa==="cafetarya"?"☕ Cafetarya":"-"}</span></td>
                    <td><span class="badge ${t.shift||""}">${t.shift==="sabah"?"🌅 Sabah":t.shift==="aksam"?"🌙 Akşam":"-"}</span></td>
                    <td class="mono">${j(t.entry_time)}</td>
                    <td class="r">
                        <div class="mono" style="font-weight:700;color:var(--txt);">${v(s)}</div>
                        ${t.shift==="aksam"&&a!==s?`<div style="font-size:11px;color:var(--txt3);">EOD Toplam: ${v(a)}</div>`:""}
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
            `}).join("")}function vt(){const e=document.getElementById("filterDate").value,t=document.getElementById("filterKasiyer").value,a=document.getElementById("filterKasa").value,s=document.getElementById("filterVardiya").value;let i=[...P];e&&(i=i.filter(n=>n.date===e)),t&&(i=i.filter(n=>n.cashier_id===t)),a&&(i=i.filter(n=>n.kasa===a)),s&&(i=i.filter(n=>n.shift===s)),document.getElementById("entriesBody").innerHTML=Y(i)}function mt(){document.getElementById("filterDate").value="",document.getElementById("filterKasiyer").value="",document.getElementById("filterKasa").value="",document.getElementById("filterVardiya").value="",document.getElementById("entriesBody").innerHTML=Y(P)}function v(e){return new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(e||0)+" ₺"}function F(e){return v(e)}function ut(){document.querySelectorAll(".kasa-amount[data-target]").forEach(e=>{const t=parseFloat(e.dataset.target)||0,a=1200,s=performance.now();function i(n){const l=Math.min((n-s)/a,1),y=1-Math.pow(1-l,3);e.textContent=v(t*y),l<1?requestAnimationFrame(i):e.textContent=v(t)}requestAnimationFrame(i)})}function yt(e,t,a){const s=document.getElementById("floatingTarget");if(!s)return;s.style.display="block",document.getElementById("ftPct").textContent=a+"%",document.getElementById("ftTarget").textContent=v(e),document.getElementById("ftCurrent").textContent=v(t);const i=[[100,"🎉 Hedef Tamamlandı!"],[80,"💪 Hedefe Yakın!"],[50,"⏰ Yarı Yolda!"],[0,"🚀 Devam Edelim!"]];document.getElementById("ftStatus").textContent=(i.find(([l])=>a>=l)||i[3])[1];const n=document.getElementById("ftBar");n.classList.toggle("done",a>=100),n.classList.toggle("near",a>=80&&a<100),setTimeout(()=>{n.style.width=Math.min(100,a)+"%"},200)}window.showVerimlilik=async function(){document.getElementById("verimlilikModal").style.display="flex";const e=document.getElementById("verimlilikBody");e.innerHTML='<div class="loading" style="padding:40px 0;"><div class="spinner"></div><div>Veriler hesaplanıyor...</div></div>';try{const t=new Date,a=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-01`,s=new Date(t.getFullYear(),t.getMonth()+1,0).getDate(),i=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${s}`,{data:n}=await x.from("daily_reports").select("date, kasa, shift, rumeli_z1, rumeli_z2, balik_ekmek, dondurma").in("kasa",["restoran","cafetarya"]).gte("date",a).lte("date",i).order("date",{ascending:!0});if(!n||n.length===0){e.innerHTML='<div style="text-align:center;padding:40px;color:var(--txt2);">Bu ay için veri bulunamadı.</div>';return}const l={};n.forEach(o=>{const c=`${o.date}-${o.kasa}`;(!l[c]||o.shift==="aksam")&&(l[c]=o)});const y={};Object.values(l).forEach(o=>{y[o.date]||(y[o.date]={restoran:0,cafetarya:0,balik:0,dondurma:0}),o.kasa==="restoran"?y[o.date].restoran=parseFloat(o.rumeli_z2)||0:o.kasa==="cafetarya"&&(y[o.date].cafetarya=parseFloat(o.rumeli_z1)||0),y[o.date].balik+=parseFloat(o.balik_ekmek)||0,y[o.date].dondurma+=parseFloat(o.dondurma)||0});const d=Object.entries(y).map(([o,c])=>({date:o,total:(c.restoran||0)+(c.cafetarya||0),restoran:c.restoran||0,cafetarya:c.cafetarya||0,balik:c.balik||0,dondurma:c.dondurma||0})).sort((o,c)=>o.date.localeCompare(c.date)),m=d.reduce((o,c)=>o+c.total,0),p=d.length,k=p>0?m/p:0,f=d.reduce((o,c)=>c.total>o.total?c:o,d[0]),w=["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"],B={},_={};d.forEach(o=>{const[c,E,S]=o.date.split("-").map(Number),$=new Date(c,E-1,S).getDay();B[$]=(B[$]||0)+o.total,_[$]=(_[$]||0)+1});const I=d.filter(o=>o.balik>0),b=[0,1,2,3,4,5,6].filter(o=>_[o]).map(o=>({name:w[o],avg:B[o]/_[o],idx:o})).sort((o,c)=>c.avg-o.avg),K=b.length>0?b[0].avg:1,L=t.toLocaleDateString("tr-TR",{month:"long",year:"numeric"});e.innerHTML=`
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
                            <div class="ver-stat-value">${v(k)}</div>
                            <div class="ver-stat-sub">Restoran + Cafetarya ortalaması</div>
                        </div>
                        <div class="ver-stat-card" style="border-color:var(--orange);">
                            <div class="ver-stat-label">🏆 En İyi Gün</div>
                            <div class="ver-stat-value">${v((f==null?void 0:f.total)||0)}</div>
                            <div class="ver-stat-sub">${f?(()=>{const[o,c,E]=f.date.split("-").map(Number);return new Date(o,c-1,E).toLocaleDateString("tr-TR",{day:"numeric",month:"long",weekday:"short"})})():"-"}</div>
                        </div>
                    </div>

                    <div class="ver-section-title">📈 Haftanın En İyi Günleri (Ortalamaya Göre)</div>
                    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px;">
                        ${b.map((o,c)=>`
                            <div style="display:flex;align-items:center;gap:12px;">
                                <div style="width:20px;text-align:right;font-size:12px;color:var(--txt2);">${c+1}.</div>
                                <div style="width:90px;font-size:13px;font-weight:600;">${o.name}</div>
                                <div style="flex:1;height:8px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;">
                                    <div style="height:100%;width:${Math.round(o.avg/K*100)}%;background:linear-gradient(90deg,${c===0?"#f59e0b,#f97316":"#3b82f6,#06b6d4"});border-radius:4px;transition:width 1s ease;"></div>
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
                                    <th>Toplam</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${d.map(o=>{const c=o.date===(f==null?void 0:f.date),[E,S,$]=o.date.split("-").map(Number),M=new Date(E,S-1,$).toLocaleDateString("tr-TR",{weekday:"short"});return`<tr${c?' class="top-row"':""}>
                                        <td>${String($).padStart(2,"0")+"/"+String(S).padStart(2,"0")}</td>
                                        <td style="color:var(--txt2);font-family:sans-serif;font-size:12px;">${M}</td>
                                        <td>${v(o.restoran)}</td>
                                        <td>${v(o.cafetarya)}</td>
                                        <td style="font-weight:700;${c?"color:var(--orange);":""}">${v(o.total)}</td>
                                    </tr>`}).join("")}
                            </tbody>
                        </table>
                    </div>

                    ${I.length>0?`
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
                                    ${I.map(o=>{const[c,E,S]=o.date.split("-").map(Number),$=new Date(c,E-1,S).toLocaleDateString("tr-TR",{weekday:"short"});return`<tr>
                                            <td>${String(S).padStart(2,"0")+"/"+String(E).padStart(2,"0")}</td>
                                            <td style="color:var(--txt2);font-size:12px;">${$}</td>
                                            <td style="font-weight:700;color:var(--cyan);">${v(o.balik)}</td>
                                        </tr>`}).join("")}
                                    <tr style="border-top:2px solid rgba(6,182,212,.3);">
                                        <td colspan="2" style="font-weight:600;color:var(--txt2);">Aylık Toplam</td>
                                        <td style="font-weight:700;color:var(--cyan);">${v(I.reduce((o,c)=>o+c.balik,0))}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>`:""}
                `}catch(t){e.innerHTML=`<div style="text-align:center;padding:40px;color:var(--red);">⚠️ Veri yüklenirken hata: ${t.message}</div>`}};window.closeVerimlilik=function(){document.getElementById("verimlilikModal").style.display="none"};document.getElementById("verimlilikModal").addEventListener("click",function(e){e.target===this&&closeVerimlilik()});function V(e){if(!e)return"-";const t=e.split("T")[0].split("-");return t.length===3?t[2]+"."+t[1]:e}function j(e){return e?new Date(e).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"}):"-"}function gt(e){return e?e.split(" ").map(t=>t[0]).join(""):"??"}function pt(e){if(!e)return"t";const t=e.split(" ")[0];return{Tuba:"t",Elif:"e",Melda:"m",Ceren:"c"}[t]||"t"}function q(e){return{yeni:"🌱 Yeni",bronz:"🥉 Bronz",gumus:"🥈 Gümüş",altin:"🥇 Altın",elmas:"💎 Elmas",efsane:"👑 Efsane",efsane_plus:"👑⭐ Süper Efsane",ozel_yildiz:"🌟 Yılın Yıldızı",ozel_ates:"🔥 Ateş Çıkışlı",ozel_roket:"🚀 Hızlı Yükseliş",ozel_onur:"🏅 Onur Madalyası",ozel_takim:"🤝 Takım Ruhu"}[e]||"🌱 Yeni"}window.assignBadge=async function(e,t){const a=[{key:"ozel_yildiz",icon:"🌟",name:"Yılın Yıldızı",desc:"En parlak performans"},{key:"ozel_ates",icon:"🔥",name:"Ateş Çıkışlı",desc:"Haftanın en iyisi"},{key:"ozel_roket",icon:"🚀",name:"Hızlı Yükseliş",desc:"En hızlı gelişim"},{key:"ozel_onur",icon:"🏅",name:"Onur Madalyası",desc:"Olağanüstü hizmet"},{key:"ozel_takim",icon:"🤝",name:"Takım Ruhu",desc:"Ekip çalışması"}],s=document.createElement("div");s.className="badge-modal-overlay",s.innerHTML=`
                <div class="badge-modal-box">
                    <div class="badge-modal-header">
                        <h3>🎖️ ${t} — Rozet Ver</h3>
                        <button onclick="this.closest('.badge-modal-overlay').remove()" class="close-btn" style="background:none;border:none;font-size:20px;color:var(--txt2);cursor:pointer;">✕</button>
                    </div>
                    <div class="badge-option-grid">
                        ${a.map(i=>`
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
                        <button class="badge-save-btn" onclick="saveBadgeAssignment('${e}')">💾 Kaydet</button>
                    </div>
                </div>`,document.body.appendChild(s)};window.selectBadgeOption=function(e,t){document.querySelectorAll(".badge-option").forEach(a=>a.classList.remove("selected")),e.classList.add("selected"),e.closest(".badge-modal-overlay").__selectedBadge=t};window.saveBadgeAssignment=async function(e){const t=document.querySelector(".badge-modal-overlay"),a=t==null?void 0:t.__selectedBadge;if(!a){alert("Lütfen bir rozet seçin.");return}try{let s=a;if(a==="auto"){const{data:n}=await x.from("cashiers").select("total_points").eq("id",e).single(),l=(n==null?void 0:n.total_points)||0;l>=600?s="efsane_plus":l>=400?s="efsane":l>=250?s="elmas":l>=150?s="altin":l>=75?s="gumus":l>=30?s="bronz":s="yeni"}const{error:i}=await x.from("cashiers").update({badge_level:s}).eq("id",e);if(i)throw i;t.remove(),z(`✅ Rozet atandı: ${q(s)}`,"success"),await loadDashboard()}catch(s){console.error("Rozet atama hatası:",s),alert("❌ Hata: "+s.message)}};window.toggleDetails=function(){const e=document.getElementById("detailedSection"),t=document.getElementById("toggleIcon"),a=document.getElementById("toggleText");e&&(e.style.display==="none"?(e.style.display="block",t.textContent="🙈",a.textContent="Detaylı Verileri Gizle"):(e.style.display="none",t.textContent="👁️",a.textContent="Detaylı Verileri Göster"))};window.setDateFilter=function(e){u=e,T=null,R=null,document.querySelectorAll(".filter-btn").forEach(d=>d.classList.remove("active"));const t=document.querySelector(`[data-range="${e}"]`);t&&t.classList.add("active");const a=new Date,s=a.toLocaleDateString("tr-TR",{month:"long",year:"numeric"}),n=new Date(a.getFullYear(),a.getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"}),l={week:"Son 7 gün",month:`Bu Ay (${s})`,lastmonth:`Geçen Ay (${n})`,all:"Tüm veriler"},y=document.getElementById("filterInfo");y&&(y.textContent=l[e]||""),window.loadDashboard()};window.showDayPicker=function(){const e=document.createElement("div");e.className="custom-date-modal",e.style.display="flex",e.id="dayPickerModal",e.innerHTML=`
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
            `,document.body.appendChild(e),document.getElementById("singleDayPicker").value=C||h(new Date)};window.applyDayFilter=function(){const e=document.getElementById("singleDayPicker"),t=e==null?void 0:e.value;if(!t){alert("⚠️ Lütfen bir tarih seçin!");return}C=t,u="day",T=null,R=null,document.querySelectorAll(".filter-btn").forEach(l=>l.classList.remove("active"));const a=document.querySelector('[data-range="day"]');a&&a.classList.add("active");const s=new Date(t).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}),i=document.getElementById("filterInfo");i&&(i.textContent=s);const n=document.getElementById("dayPickerModal");n&&n.remove(),window.loadDashboard()};window.showCustomDatePicker=function(){const e=document.getElementById("customDateModal"),t=h(new Date);if(document.getElementById("customStartDate").max=t,document.getElementById("customEndDate").max=t,T)document.getElementById("customStartDate").value=T;else{const a=new Date;a.setDate(a.getDate()-7),document.getElementById("customStartDate").value=h(a)}document.getElementById("customEndDate").value=R||t,e.style.display="flex"};window.closeCustomDatePicker=function(){document.getElementById("customDateModal").style.display="none"};window.applyCustomDateRange=function(){const e=document.getElementById("customStartDate").value,t=document.getElementById("customEndDate").value;if(!e||!t){alert("⚠️ Lütfen başlangıç ve bitiş tarihlerini seçin!");return}if(e>t){alert("⚠️ Başlangıç tarihi bitiş tarihinden sonra olamaz!");return}T=e,R=t,u="custom",document.querySelectorAll(".filter-btn").forEach(l=>l.classList.remove("active"));const a=document.querySelector('[data-range="custom"]');a&&a.classList.add("active");const s=new Date(e).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),i=new Date(t).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),n=document.getElementById("filterInfo");n&&(n.textContent=`${s} - ${i}`),window.closeCustomDatePicker(),window.loadDashboard()};window.loadDashboard=async function(){try{document.getElementById("mainContent").innerHTML=`
                    <div class="loading">
                        <div class="spinner"></div>
                        <div>Veriler yükleniyor...</div>
                    </div>
                `;const{weekly:e,reports:t,cashiers:a}=await W();P=t,await dt(e,t,a)}catch(e){console.error("Dashboard yükleme hatası:",e),document.getElementById("mainContent").innerHTML=`
                <div class="loading">
                    <div style="font-size:48px;margin-bottom:16px;">❌</div>
                    <div style="font-size:18px;color:var(--red);">Veri yükleme hatası!</div>
                    <div style="color:var(--txt2);margin-top:8px;">${e.message}</div>
                    <button onclick="loadDashboard()" class="nb" style="margin-top:20px;">🔄 Tekrar Dene</button>
                </div>
            `}};window.loadDashboard();setInterval(()=>window.loadDashboard(),5*60*1e3);window.deleteEntry=async function(e){console.log("deleteEntry çağrıldı:",e);const t=document.createElement("div");t.className="modal-overlay",t.innerHTML=`
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
            `,document.body.appendChild(t)};window.confirmDelete=async function(e){const t=document.querySelector(".modal-overlay");try{console.log("Siliniyor:",e);const{data:a,error:s}=await x.from("daily_reports").delete().eq("id",e);if(console.log("Delete response:",{data:a,error:s}),s)throw new Error(s.message);t&&t.remove(),z("✅ Kayıt başarıyla silindi!","success"),await loadDashboard()}catch(a){console.error("Silme hatası:",a),z("❌ Silme başarısız: "+a.message,"error"),t&&t.remove()}};window.editEntry=async function(e){console.log("editEntry çağrıldı:",e);const{data:t,error:a}=await x.from("daily_reports").select("*").eq("id",e).single();if(a){z("❌ Kayıt bulunamadı","error");return}const s=document.createElement("div");s.className="modal-overlay",s.innerHTML=`
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
                        <button class="modal-btn confirm" style="background:var(--acc);" onclick="confirmEdit('${e}')">
                            Kaydet
                        </button>
                    </div>
                </div>
            `,document.body.appendChild(s)};window.confirmEdit=async function(e){const t=document.querySelector(".modal-overlay");try{const a=parseFloat(document.getElementById("editZCiro").value)||0,s=parseInt(document.getElementById("editPuan").value)||0,i=document.getElementById("editDurum").value==="true";console.log("Güncelleniyor:",{entryId:e,newZCiro:a,newPuan:s,newDurum:i});const{error:n}=await x.from("daily_reports").update({total_revenue:a,points_earned:s,is_on_time:i}).eq("id",e);if(n)throw n;const{data:l}=await x.from("daily_reports").select("cashier_id").eq("id",e).single();if(!l)throw new Error("Kayıt bulunamadı");const{data:y}=await x.from("daily_reports").select("points_earned").eq("cashier_id",l.cashier_id),d=y.reduce((k,f)=>k+(parseInt(f.points_earned)||0),0);console.log("Toplam puan:",d);let m="yeni";d>=1e3?m="efsane":d>=500?m="elmas":d>=300?m="altin":d>=150?m="gumus":d>=50&&(m="bronz");const{error:p}=await x.from("cashiers").update({total_points:d,badge_level:m}).eq("id",l.cashier_id);if(p)throw p;t&&t.remove(),z("✅ Kayıt ve kasiyer puanı güncellendi!","success"),await loadDashboard()}catch(a){console.error("Güncelleme hatası:",a),z("❌ Güncelleme başarısız: "+a.message,"error"),t&&t.remove()}};function z(e,t="success"){const a=document.createElement("div");a.style.cssText=`
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
            `,a.textContent=e,document.body.appendChild(a),setTimeout(()=>{a.style.animation="slideOut .3s",setTimeout(()=>a.remove(),300)},3e3)}
