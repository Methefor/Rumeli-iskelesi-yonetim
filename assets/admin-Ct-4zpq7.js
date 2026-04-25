import"./modulepreload-polyfill-B5Qt9EMX.js";import{supabase as _}from"./supabase-client-mCNoDXkE.js";import"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";typeof window._adminLoadOk=="function"&&window._adminLoadOk();let u="month",S=null,F=null,z=null;function k(e){return e.getFullYear()+"-"+String(e.getMonth()+1).padStart(2,"0")+"-"+String(e.getDate()).padStart(2,"0")}async function U(){let e,t=null;const a=new Date;if(u==="day"&&z)e=z,t=z;else if(u==="custom"&&S&&F)e=S,t=F;else switch(u){case"week":const l=new Date;l.setDate(l.getDate()-7),e=k(l);break;case"month":e=k(new Date(a.getFullYear(),a.getMonth(),1)),t=k(new Date(a.getFullYear(),a.getMonth()+1,0));break;case"lastmonth":e=k(new Date(a.getFullYear(),a.getMonth()-1,1)),t=k(new Date(a.getFullYear(),a.getMonth(),0));break;case"all":e="2020-01-01";break;default:e=k(new Date(a.getFullYear(),a.getMonth(),1)),t=k(new Date(a.getFullYear(),a.getMonth()+1,0))}let n=_.from("daily_reports").select("*, cashiers(name)").gte("date",e).order("date",{ascending:!1});t&&(n=n.lte("date",t));const[i,s]=await Promise.all([n,_.from("cashiers").select("*").order("total_points",{ascending:!1})]);return{weekly:[],reports:i.data||[],cashiers:s.data||[]}}function Q(e){const t={};let a=0,n=0,i=0;e.forEach(d=>{if(d.kasa==="tek_kasa"){const g=d.date;(!t[g]||d.shift==="aksam")&&(t[g]=d)}else a+=parseFloat(d.rumeli_z1||0)+parseFloat(d.rumeli_z2||0),n+=parseFloat(d.balik_ekmek||0),i+=parseFloat(d.dondurma||0)});const s=Object.values(t).reduce((d,g)=>(d.z+=parseFloat(g.rumeli_z1||0),d.balik+=parseFloat(g.balik_ekmek||0),d.dond+=parseFloat(g.dondurma||0),d),{z:0,balik:0,dond:0}),l=s.z+a,p=s.balik+n,c=s.dond+i;return{zRaporu:l,balik:p,dondurma:c,total:l+p+c,restoran:0,cafetarya:0}}function J(e,t){const a={};return t.forEach(n=>{a[n.id]={cashier_id:n.id,name:n.name,badge_level:n.badge_level,total_score:0,entry_count:0,on_time_count:0}}),e.forEach(n=>{var l;const i=n.cashier_id;if(!a[i]){const p=((l=n.cashiers)==null?void 0:l.name)||"Bilinmiyor";a[i]={cashier_id:i,name:p,badge_level:null,total_score:0,entry_count:0,on_time_count:0}}const s=(n.is_on_time?50:0)+(parseFloat(n.rumeli_z1||0)>0||parseFloat(n.total_revenue||0)>0?50:0);a[i].total_score+=s,a[i].entry_count+=1,n.is_on_time&&(a[i].on_time_count+=1)}),Object.values(a).map(n=>({...n,performance_pct:n.entry_count>=1?Math.round(n.total_score/(n.entry_count*100)*100):null})).sort((n,i)=>n.performance_pct===null&&i.performance_pct===null?0:n.performance_pct===null?1:i.performance_pct===null?-1:i.performance_pct!==n.performance_pct?i.performance_pct-n.performance_pct:i.entry_count-n.entry_count)}function G(e){const t={};e.forEach(i=>{const s=i.date;(!t[s]||i.shift==="aksam")&&(t[s]=i)});const a={};Object.values(t).forEach(i=>{const s=i.date;a[s]||(a[s]=0),a[s]+=parseFloat(i.rumeli_z1||0)+parseFloat(i.rumeli_z2||0)+parseFloat(i.balik_ekmek||0)+parseFloat(i.dondurma||0)});const n=Object.keys(a).sort();return{labels:n.map(i=>H(i)),data:n.map(i=>a[i])}}function X(e){const t={sabah:0,aksam:0};return e.forEach(a=>{const n=parseFloat(a.individual_revenue||0);a.shift==="sabah"?t.sabah+=n:a.shift==="aksam"&&(t.aksam+=n)}),t}function tt(e,t){const a={};return e.forEach(n=>{var s;const i=((s=n.cashiers)==null?void 0:s.name)||"Bilinmiyor";a[i]||(a[i]=0),a[i]+=parseFloat(n.individual_revenue||0)}),a}function et(e,t){const a=k(new Date),n=e.filter(d=>d.date===a),i=[...new Set(n.map(d=>d.cashier_id))],s=t.filter(d=>!i.includes(d.id)),l=e.filter(d=>!d.is_on_time),p=G(e),c=Math.max(...p.data,0);return{notEntered:s,lateEntries:l,maxCiro:c}}function at(e){const t=G(e),a=Math.max(...t.data,0),n=k(new Date),i=e.filter(d=>d.date===n),l=[...new Set(i.map(d=>d.cashier_id))].length;return{maxDailyCiro:a,activeCashiers:l,avgEntryTime:"2.5dk",weeklyGrowth:"+12%"}}function it(){const e=new Date,t=e.getDay(),a=["2026-01-01","2026-04-23","2026-05-01","2026-05-19","2026-08-30","2026-10-29"],n=k(e);return a.includes(n)?"special":t===0||t===6?"weekend":"weekday"}async function nt(){try{const e=it();console.log("Hedef tipi:",e);const{data:t,error:a}=await _.from("targets").select("amount").eq("target_type",e).single();return a?(console.error("Hedef çekme hatası:",a),{weekday:15e4,weekend:2e5,special:25e4}[e]):(console.log("Çekilen hedef:",t.amount),parseFloat(t.amount)||15e4)}catch(e){return console.error("fetchDailyTarget hatası:",e),15e4}}function st(){typeof anime>"u"||(anime({targets:".kasa-card, .sc, .total-hero-card",opacity:[0,1],translateY:[40,0],delay:anime.stagger(100),duration:800,easing:"easeOutCubic"}),anime({targets:".rank-card",opacity:[0,1],translateX:[-40,0],delay:anime.stagger(120),duration:700,easing:"easeOutCubic"}))}function ot(){if(typeof anime>"u")return;const e=document.getElementById("totalDailyCiro"),t=parseFloat(e.getAttribute("data-value")||0);anime({targets:{value:0},value:t,duration:2e3,easing:"easeOutExpo",update:function(i){e.textContent=v(i.animations[0].currentValue)}});const a=document.getElementById("progressBarFill"),n=parseFloat(a.getAttribute("data-percent")||0);anime({targets:"#progressBarFill",width:n+"%",duration:1500,easing:"easeInOutQuad"})}function lt(e){const t={gida:{name:"Gıda",icon:"🥗",total:0,color:"#22c55e"},kahvalti:{name:"Kahvaltı",icon:"🥐",total:0,color:"#f59e0b"},kahve:{name:"Kahve",icon:"☕",total:0,color:"#8b5cf6"},meyvesuyu:{name:"Meyve Suyu",icon:"🧃",total:0,color:"#ec4899"},sicak_icecek:{name:"Sıcak İçecek",icon:"🔥",total:0,color:"#ef4444"},soguk_icecek:{name:"Soğuk İçecek",icon:"🥤",total:0,color:"#3b82f6"},tatli:{name:"Tatlı",icon:"🍰",total:0,color:"#a855f7"}},a={};e.forEach(s=>{const l=`${s.date}-${s.kasa}`;(!a[l]||s.shift==="aksam")&&(a[l]=s)}),Object.values(a).forEach(s=>{t.gida.total+=parseFloat(s.gida)||0,t.kahvalti.total+=parseFloat(s.kahvalti)||0,t.kahve.total+=parseFloat(s.kahve)||0,t.meyvesuyu.total+=parseFloat(s.meyvesuyu)||0,t.sicak_icecek.total+=parseFloat(s.sicak_icecek)||0,t.soguk_icecek.total+=parseFloat(s.soguk_icecek)||0,t.tatli.total+=parseFloat(s.tatli)||0});const n=Object.values(t).reduce((s,l)=>s+l.total,0);Object.values(t).forEach(s=>{s.percentage=n>0?s.total/n*100:0});const i=Object.entries(t).map(([s,l])=>({key:s,...l})).sort((s,l)=>l.total-s.total);return{categories:i,total:n,highest:i[0],lowest:i[i.length-1],average:n/i.length}}function rt(e){return e.categories.map(t=>`
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
            `).join("")}function dt(e){var a;const t=((a=e.categories[0])==null?void 0:a.total)||1;return e.categories.map(n=>{const i=t>0?n.total/t*100:0;return`
                    <div class="category-bar">
                        <div class="category-bar-label">${n.icon} ${n.name}</div>
                        <div class="category-bar-track">
                            <div class="category-bar-fill" style="width:${i}%;background:${n.color};">
                                ${L(n.total)}
                            </div>
                        </div>
                    </div>
                `}).join("")}function ct(e){return`
                <div class="category-summary-card">
                    <div class="summary-icon">🏆</div>
                    <div class="summary-label">En Çok Satan</div>
                    <div class="summary-value">${e.highest.icon} ${e.highest.name}</div>
                    <div style="font-size:12px;color:var(--acc);margin-top:4px;font-weight:600;">${L(e.highest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📉</div>
                    <div class="summary-label">En Az Satan</div>
                    <div class="summary-value">${e.lowest.icon} ${e.lowest.name}</div>
                    <div style="font-size:12px;color:var(--txt3);margin-top:4px;font-weight:600;">${L(e.lowest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📊</div>
                    <div class="summary-label">Kategori Ort.</div>
                    <div class="summary-value">${L(e.average)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">Kategori başına</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">💰</div>
                    <div class="summary-label">Kategori Toplamı</div>
                    <div class="summary-value">${L(e.total)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">7 kategori</div>
                </div>
            `}async function mt(e,t,a){const n=await nt(),i=Q(t),s=G(t),l=X(t),p=tt(t),c=et(t,a),d=at(t),g=lt(t),x=J(t,a),y=x.length>0&&x[0].entry_count>0?x[0]:null,R=t.length,h=t.filter(m=>m.is_on_time).length,B=R>0?Math.round(h/R*100):0,b=[...new Set(t.map(m=>m.date))].length,I=b>0?i.total/b:0,C=i.total,T=u==="day"&&z?z:k(new Date),o={};t.filter(m=>m.date===T).forEach(m=>{const D=`${m.date}-${m.kasa}`;(!o[D]||m.shift==="aksam")&&(o[D]=m)});const r=Object.values(o).reduce((m,D)=>m+parseFloat(D.total_revenue||0),0),f=n>0?Math.min(100,Math.round(r/n*100)):0,$=u==="week"?"Bu Hafta":u==="month"?`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long"})})`:u==="lastmonth"?`Geçen Ay (${new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long"})})`:u==="all"?"Tüm Veriler":u==="day"&&z?new Date(z).toLocaleDateString("tr-TR",{day:"numeric",month:"short"}):S?`${new Date(S).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"})} - ${new Date(F).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"})}`:"Bu Ay";document.getElementById("mainContent").innerHTML=`

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
                    ${u==="week"?"Son 7 gün":u==="month"?`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`:u==="lastmonth"?`Geçen Ay (${new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`:u==="all"?"Tüm veriler":u==="day"&&z?new Date(z).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}):S?`${new Date(S).toLocaleDateString("tr-TR")} - ${new Date(F).toLocaleDateString("tr-TR")}`:`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`}
                </div>
            </div>

            <!-- GÜNLÜK TOPLAM HERO KARTI -->
            <div class="section-title">💰 Rumeli İskelesi Toplam Ciro</div>
            <div class="total-hero-card">
                <div class="total-hero-left">
                    <div class="total-hero-label">${u==="month"?"Bu Ay Toplam Ciro":u==="week"?"Bu Hafta Toplam Ciro":u==="day"?"Günlük Toplam Ciro":"Dönem Toplam Ciro"}</div>
                    <div class="total-hero-amount" id="totalDailyCiro" data-value="${C}">0,00 ₺</div>
                    <div class="total-hero-breakdown">
                        <span class="breakdown-item">🏪 <span id="breakdownZ">${v(i.zRaporu)}</span></span>
                        <span class="breakdown-item">🐟 <span id="breakdownBalik">${v(i.balik)}</span></span>
                        <span class="breakdown-item">🍦 <span id="breakdownDondurma">${v(i.dondurma)}</span></span>
                    </div>
                </div>
                <div class="total-hero-right">
                    <div class="target-section">
                        <div class="target-label">🏪 Rumeli İskelesi</div>
                        <div class="target-amount">${v(i.zRaporu)}</div>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" id="progressBarFill" style="width:0%" data-percent="${f}"></div>
                        </div>
                        <div class="progress-percent" id="progressPercent">Günlük Ort: ${v(b>0?i.total/b:0)}</div>
                    </div>
                </div>
            </div>

            <!-- CİRO DAĞILIMI -->
            <div class="section-title">🏪 Ciro Dağılımı</div>
            <div class="kasa-grid">
                <div class="kasa-card restoran" style="animation: kasaPop .5s ease .0s both;">
                    <div class="kasa-icon">🏪</div>
                    <div class="kasa-label">Rumeli İskelesi</div>
                    <div class="kasa-amount" data-target="${i.zRaporu}">0,00 ₺</div>
                    <div class="kasa-sub">Kasa Toplamı</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.zRaporu/i.total*100):0} toplam</div>
                </div>
                <div class="kasa-card balik" style="animation: kasaPop .5s ease .1s both;">
                    <div class="kasa-icon">🐟</div>
                    <div class="kasa-label">Balık Ekmek</div>
                    <div class="kasa-amount" data-target="${i.balik}">0,00 ₺</div>
                    <div class="kasa-sub">Ayrı Satış</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.balik/i.total*100):0} toplam</div>
                </div>
                <div class="kasa-card dondurma" style="animation: kasaPop .5s ease .2s both;">
                    <div class="kasa-icon">🍦</div>
                    <div class="kasa-label">Dondurma</div>
                    <div class="kasa-amount" data-target="${i.dondurma}">0,00 ₺</div>
                    <div class="kasa-sub">Ayrı Satış</div>
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
                    <div class="sc-v">${v(I)}</div>
                    <div class="sc-s">Son ${b} gün</div>
                </div>
                <div class="sc emerald">
                    <div class="sc-l">🏪 Rumeli İskelesi Toplam</div>
                    <div class="sc-v">${v(i.zRaporu)}</div>
                    <div class="sc-s">Kasa toplamı</div>
                </div>
                <div class="sc cyan">
                    <div class="sc-l">🏪 Rumeli İskelesi Günlük Ort.</div>
                    <div class="sc-v">${v(b>0?i.zRaporu/b:0)}</div>
                    <div class="sc-s">${b} günlük ortalama</div>
                </div>
                <div class="sc orange">
                    <div class="sc-l">Zamanında Giriş</div>
                    <div class="sc-v">%${B}</div>
                    <div class="sc-s">${h}/${R} giriş</div>
                </div>
                <div class="sc green">
                    <div class="sc-l">Toplam Giriş Sayısı</div>
                    <div class="sc-v">${R}</div>
                    <div class="sc-s">${b} günlük</div>
                </div>
                <div class="sc pink">
                    <div class="sc-l">En Yüksek Günlük Ciro</div>
                    <div class="sc-v" id="maxDailyCiro">${v(d.maxDailyCiro)}</div>
                    <div class="sc-s">Dönem rekoru</div>
                </div>
                <div class="sc indigo">
                    <div class="sc-l">Aktif Kasiyer</div>
                    <div class="sc-v" id="activeCashiers">${d.activeCashiers}/${a.length}</div>
                    <div class="sc-s">Bugün giriş yapan</div>
                </div>
            </div>

            <!-- KATEGORİ SATIŞ ANALİZİ -->
            <div class="section-title">🏷️ Kategori Bazlı Satış Analizi</div>

            <!-- Kategori Kartları -->
            <div class="category-cards-grid">
                ${rt(g)}
            </div>

            <!-- Kategori Grafikler + Özet -->
            <div class="category-charts">
                <div class="category-chart-box">
                    <div class="chart-title">📊 Kategori Karşılaştırması</div>
                    ${dt(g)}
                </div>
                <div class="category-chart-box">
                    <div class="chart-title">📋 Özet İstatistikler</div>
                    <div class="category-summary">
                        ${ct(g)}
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
                <div class="alert-card ${c.notEntered.length>0?"danger":"ok"}">
                    <div class="alert-title">
                        ${c.notEntered.length>0?"❌":"✅"} Bugün Giriş Yapmayanlar
                    </div>
                    ${c.notEntered.length===0?'<div class="alert-item">Tüm kasiyerler giriş yaptı!</div>':c.notEntered.map(m=>`
                            <div class="alert-item">
                                <span>${m.name}</span>
                                <span style="color:var(--red)">Giriş Yok</span>
                            </div>
                        `).join("")}
                </div>
                <div class="alert-card ${c.lateEntries.length>0?"warning":"ok"}">
                    <div class="alert-title">⚠️ Geç Girişler (Bu Hafta)</div>
                    ${c.lateEntries.length===0?'<div class="alert-item">Bu hafta geç giriş yok! 🎉</div>':c.lateEntries.slice(0,5).map(m=>{var D;return`
                            <div class="alert-item">
                                <span>${((D=m.cashiers)==null?void 0:D.name)||"Bilinmiyor"}</span>
                                <span style="color:var(--orange)">${V(m.entry_time)}</span>
                            </div>
                        `}).join("")}
                </div>
                <div class="alert-card ok">
                    <div class="alert-title">📊 Haftalık Özet</div>
                    <div class="alert-item">
                        <span>En Yüksek Gün</span>
                        <span style="color:var(--green)">${v(c.maxCiro)}</span>
                    </div>
                    <div class="alert-item">
                        <span>Toplam Puan</span>
                        <span style="color:var(--orange)">${e.reduce((m,D)=>m+(D.weekly_points||0),0)}</span>
                    </div>
                    <div class="alert-item">
                        <span>Aktif Kasiyer</span>
                        <span style="color:var(--green)">${e.filter(m=>(m.total_entries||0)>0).length}/${a.length}</span>
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
                            ${a.map(m=>`<option value="${m.id}">${m.name}</option>`).join("")}
                        </select>
                        <select id="filterKasa" class="fsel">
                            <option value="">Tüm Kasalar</option>
                            <option value="tek_kasa">Tek Kasa</option>
                            <option value="restoran">Eski: Restoran</option>
                            <option value="cafetarya">Eski: Cafetarya</option>
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
                                ${O(t)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- KASİYER SIRALAMALARI — ADIL PERFORMANS ORANI -->
            <div class="section-title" style="margin-top:40px;">
                👥 Kasiyer Sıralaması
                <span style="font-size:13px;font-weight:500;color:var(--txt2);">
                    (Performans Oranı — Adil Sıralama)
                </span>
            </div>
            <div style="font-size:12px;color:var(--txt3);margin-bottom:16px;padding:10px 14px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.15);border-radius:10px;">
                ℹ️ Sıralama <strong>zamanında giriş oranı</strong> ve <strong>eksiksiz veri oranı</strong> üzerinden hesaplanır.
                Az giriş yapan kasiyer çok giriş yapana göre dezavantajlı değildir.
            </div>
            <div id="rankGrid" class="rank-grid">
                ${x.map((m,D)=>{const P=a.find(W=>W.id===m.cashier_id)||{},Y=P.id||"",q=j(P.badge_level),N=m.performance_pct!==null?m.performance_pct:"—",Z=m.performance_pct>=85?"var(--green)":m.performance_pct>=65?"var(--orange)":"var(--txt2)";return`
                    <div class="rank-card">
                        <div class="rank-pos p${Math.min(D+1,4)}">#${D+1}</div>
                        <div class="rank-avatar av-${bt(m.name)}">${ft(m.name)}</div>
                        <div class="rank-info">
                            <div class="rank-name">${m.name}</div>
                            <div class="rank-meta">
                                ${m.entry_count} giriş · ${m.on_time_count} zamanında
                                ${m.performance_pct===null?" · <em>Yeterli veri yok</em>":""}
                            </div>
                        </div>
                        <div class="rank-right">
                            <div class="rank-pts" style="color:${Z}">%${N}</div>
                            <div class="rank-badge-pill">${q}</div>
                            ${Y?`<button class="badge-assign-btn" onclick="assignBadge('${Y}','${m.name}')">🎖️ Rozet Ver</button>`:""}
                        </div>
                    </div>`}).join("")}
            </div>

            <!-- AYIN ELEMANI HERO -->
            <div id="heroSection" class="hero ${y&&y.performance_pct>0?"gold":"blue"}" style="margin-top:24px;">
                <div class="hero-badge">🏆 AYIN ELEMANI</div>
                <div class="hero-name">${y?y.name:"Henüz Veri Yok"}</div>
                <div class="hero-amt">%${y?y.performance_pct:0} Performans</div>
                <div class="hero-sub">
                    ${y?`${y.entry_count} giriş · ${y.on_time_count} zamanında`:"İlk veriyi girin!"}
                </div>
            </div>
        `,vt(s,i,l,p);const w=document.getElementById("applyFiltersBtn"),M=document.getElementById("clearFiltersBtn");w&&w.addEventListener("click",ut),M&&M.addEventListener("click",pt),document.getElementById("lastUpdate").textContent="Son güncelleme: "+new Date().toLocaleTimeString("tr-TR",{timeZone:"Europe/Istanbul"}),setTimeout(()=>{st(),ot(),gt()},100),yt(n,r,f)}let E={};function vt(e,t,a,n){Chart.defaults.color="#7a8ba8",Chart.defaults.borderColor="#1e3a5f",Chart.defaults.font.family="DM Sans";const i=document.getElementById("dailyChart");i&&(E.daily&&E.daily.destroy(),E.daily=new Chart(i,{type:"bar",data:{labels:e.labels.length>0?e.labels:["Veri Yok"],datasets:[{label:"Günlük Ciro (₺)",data:e.data.length>0?e.data:[0],backgroundColor:"rgba(59,130,246,.7)",borderColor:"#3b82f6",borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:c=>"₺"+new Intl.NumberFormat("tr-TR").format(c)}}}}}));const s=document.getElementById("kasaChart");if(s){E.kasa&&E.kasa.destroy();const c=t.total>0,d=c?[t.zRaporu,t.balik,t.dondurma]:[.001,.001,.001];E.kasa=new Chart(s,{type:"doughnut",data:{labels:["Rumeli İskelesi","Balık Ekmek","Dondurma"],datasets:[{data:d,backgroundColor:["rgba(59,130,246,.8)","rgba(6,182,212,.8)","rgba(236,72,153,.8)"],borderColor:"#111d32",borderWidth:3,hoverOffset:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{position:"bottom",labels:{padding:16,usePointStyle:!0}},tooltip:{enabled:c,callbacks:{label:g=>{const x=g.raw,y=g.dataset.data.reduce((h,B)=>h+B,0),R=Math.round(x/y*100);return` ${g.label}: ${v(x)} (%${R})`}}}},cutout:"65%"}})}const l=document.getElementById("shiftChart");l&&(E.shift&&E.shift.destroy(),E.shift=new Chart(l,{type:"bar",data:{labels:["Sabah Vardiyası","Akşam Vardiyası"],datasets:[{label:"Ciro (₺)",data:[a.sabah||0,a.aksam||0],backgroundColor:["rgba(245,158,11,.7)","rgba(139,92,246,.7)"],borderColor:["#f59e0b","#8b5cf6"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:c=>"₺"+new Intl.NumberFormat("tr-TR").format(c)}}}}}));const p=document.getElementById("cashierChart");if(p){E.cashier&&E.cashier.destroy();const c=Object.keys(n),d=Object.values(n);E.cashier=new Chart(p,{type:"bar",data:{labels:c.length>0?c:["Veri Yok"],datasets:[{label:"Ciro (₺)",data:d.length>0?d:[0],backgroundColor:["rgba(139,92,246,.7)","rgba(245,158,11,.7)","rgba(236,72,153,.7)","rgba(34,197,94,.7)"],borderColor:["#8b5cf6","#f59e0b","#ec4899","#22c55e"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:g=>"₺"+new Intl.NumberFormat("tr-TR").format(g)}}}}})}}let K=[];function O(e){return e.length===0?'<tr><td colspan="9" style="text-align:center;color:var(--txt2);padding:40px;">Henüz veri yok</td></tr>':e.map(t=>{var i;const a=parseFloat(t.total_revenue||0),n=parseFloat(t.individual_revenue||a);return`
                <tr>
                    <td>${H(t.date)}</td>
                    <td style="font-weight:600">${((i=t.cashiers)==null?void 0:i.name)||"-"}</td>
                    <td><span class="badge ${t.kasa||""}">${t.kasa==="restoran"?"🍽️ Restoran":t.kasa==="cafetarya"?"☕ Cafetarya":"-"}</span></td>
                    <td><span class="badge ${t.shift||""}">${t.shift==="sabah"?"🌅 Sabah":t.shift==="aksam"?"🌙 Akşam":"-"}</span></td>
                    <td class="mono">${V(t.entry_time)}</td>
                    <td class="r">
                        <div class="mono" style="font-weight:700;color:var(--txt);">${v(n)}</div>
                        ${t.shift==="aksam"&&a!==n?`<div style="font-size:11px;color:var(--txt3);">EOD Toplam: ${v(a)}</div>`:""}
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
            `}).join("")}function ut(){const e=document.getElementById("filterDate").value,t=document.getElementById("filterKasiyer").value,a=document.getElementById("filterKasa").value,n=document.getElementById("filterVardiya").value;let i=[...K];e&&(i=i.filter(s=>s.date===e)),t&&(i=i.filter(s=>s.cashier_id===t)),a&&(i=i.filter(s=>s.kasa===a)),n&&(i=i.filter(s=>s.shift===n)),document.getElementById("entriesBody").innerHTML=O(i)}function pt(){document.getElementById("filterDate").value="",document.getElementById("filterKasiyer").value="",document.getElementById("filterKasa").value="",document.getElementById("filterVardiya").value="",document.getElementById("entriesBody").innerHTML=O(K)}function v(e){return new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(e||0)+" ₺"}function L(e){return v(e)}function gt(){document.querySelectorAll(".kasa-amount[data-target]").forEach(e=>{const t=parseFloat(e.dataset.target)||0,a=1200,n=performance.now();function i(s){const l=Math.min((s-n)/a,1),p=1-Math.pow(1-l,3);e.textContent=v(t*p),l<1?requestAnimationFrame(i):e.textContent=v(t)}requestAnimationFrame(i)})}function yt(e,t,a){const n=document.getElementById("floatingTarget");if(!n)return;n.style.display="block",document.getElementById("ftPct").textContent=a+"%",document.getElementById("ftTarget").textContent=v(e),document.getElementById("ftCurrent").textContent=v(t);const i=[[100,"🎉 Hedef Tamamlandı!"],[80,"💪 Hedefe Yakın!"],[50,"⏰ Yarı Yolda!"],[0,"🚀 Devam Edelim!"]];document.getElementById("ftStatus").textContent=(i.find(([l])=>a>=l)||i[3])[1];const s=document.getElementById("ftBar");s.classList.toggle("done",a>=100),s.classList.toggle("near",a>=80&&a<100),setTimeout(()=>{s.style.width=Math.min(100,a)+"%"},200)}window.showVerimlilik=async function(){document.getElementById("verimlilikModal").style.display="flex";const e=document.getElementById("verimlilikBody");e.innerHTML='<div class="loading" style="padding:40px 0;"><div class="spinner"></div><div>Veriler hesaplanıyor...</div></div>';try{const t=new Date,a=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-01`,n=new Date(t.getFullYear(),t.getMonth()+1,0).getDate(),i=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${n}`,{data:s}=await _.from("daily_reports").select("date, kasa, shift, rumeli_z1, rumeli_z2, balik_ekmek, dondurma").in("kasa",["restoran","cafetarya"]).gte("date",a).lte("date",i).order("date",{ascending:!0});if(!s||s.length===0){e.innerHTML='<div style="text-align:center;padding:40px;color:var(--txt2);">Bu ay için veri bulunamadı.</div>';return}const l={};s.forEach(o=>{const r=`${o.date}-${o.kasa}`;if(!l[r])l[r]=o;else{const f=l[r],$=o.kasa==="restoran"?parseFloat(o.rumeli_z2):parseFloat(o.rumeli_z1),w=f.kasa==="restoran"?parseFloat(f.rumeli_z2):parseFloat(f.rumeli_z1);(f.shift!=="aksam"&&o.shift==="aksam"||f.shift==="aksam"&&o.shift==="aksam"&&$>w)&&(l[r]=o)}});const p={};Object.values(l).forEach(o=>{p[o.date]||(p[o.date]={restoran:0,cafetarya:0,balik:0,dondurma:0}),o.kasa==="restoran"?p[o.date].restoran=parseFloat(o.rumeli_z2)||0:o.kasa==="cafetarya"&&(p[o.date].cafetarya=parseFloat(o.rumeli_z1)||0),p[o.date].balik+=parseFloat(o.balik_ekmek)||0,p[o.date].dondurma+=parseFloat(o.dondurma)||0});const c=Object.entries(p).map(([o,r])=>({date:o,total:(r.restoran||0)+(r.cafetarya||0),restoran:r.restoran||0,cafetarya:r.cafetarya||0,balik:r.balik||0,dondurma:r.dondurma||0})).sort((o,r)=>o.date.localeCompare(r.date)),d=c.reduce((o,r)=>o+r.total,0),g=c.length,x=g>0?d/g:0,y=c.reduce((o,r)=>r.total>o.total?r:o,c[0]),R=["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"],h={},B={};c.forEach(o=>{const[r,f,$]=o.date.split("-").map(Number),w=new Date(r,f-1,$).getDay();h[w]=(h[w]||0)+o.total,B[w]=(B[w]||0)+1});const b=c.filter(o=>o.balik>0),I=[0,1,2,3,4,5,6].filter(o=>B[o]).map(o=>({name:R[o],avg:h[o]/B[o],idx:o})).sort((o,r)=>r.avg-o.avg),C=I.length>0?I[0].avg:1,T=t.toLocaleDateString("tr-TR",{month:"long",year:"numeric"});e.innerHTML=`
                    <div class="ver-stats-grid">
                        <div class="ver-stat-card">
                            <div class="ver-stat-label">🏢 Rumeli İskelesi Toplam</div>
                            <div class="ver-stat-value">${v(d)}</div>
                            <div class="ver-stat-sub">${T}</div>
                        </div>
                        <div class="ver-stat-card">
                            <div class="ver-stat-label">📅 Veri Günü</div>
                            <div class="ver-stat-value">${g} gün</div>
                            <div class="ver-stat-sub">Girişi olan günler</div>
                        </div>
                        <div class="ver-stat-card">
                            <div class="ver-stat-label">📊 Günlük Ortalama</div>
                            <div class="ver-stat-value">${v(x)}</div>
                            <div class="ver-stat-sub">Restoran + Cafetarya ortalaması</div>
                        </div>
                        <div class="ver-stat-card" style="border-color:var(--orange);">
                            <div class="ver-stat-label">🏆 En İyi Gün</div>
                            <div class="ver-stat-value">${v((y==null?void 0:y.total)||0)}</div>
                            <div class="ver-stat-sub">${y?(()=>{const[o,r,f]=y.date.split("-").map(Number);return new Date(o,r-1,f).toLocaleDateString("tr-TR",{day:"numeric",month:"long",weekday:"short"})})():"-"}</div>
                        </div>
                    </div>

                    <div class="ver-section-title">📈 Haftanın En İyi Günleri (Ortalamaya Göre)</div>
                    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px;">
                        ${I.map((o,r)=>`
                            <div style="display:flex;align-items:center;gap:12px;">
                                <div style="width:20px;text-align:right;font-size:12px;color:var(--txt2);">${r+1}.</div>
                                <div style="width:90px;font-size:13px;font-weight:600;">${o.name}</div>
                                <div style="flex:1;height:8px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;">
                                    <div style="height:100%;width:${Math.round(o.avg/C*100)}%;background:linear-gradient(90deg,${r===0?"#f59e0b,#f97316":"#3b82f6,#06b6d4"});border-radius:4px;transition:width 1s ease;"></div>
                                </div>
                                <div style="width:130px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;color:${r===0?"var(--orange)":"var(--txt)"};">${v(o.avg)}</div>
                            </div>
                        `).join("")}
                    </div>

                    <div class="ver-section-title">📋 Günlük Ciro Detayı — ${T}</div>
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
                                ${c.map(o=>{const r=o.date===(y==null?void 0:y.date),[f,$,w]=o.date.split("-").map(Number),M=new Date(f,$-1,w).toLocaleDateString("tr-TR",{weekday:"short"});return`<tr${r?' class="top-row"':""}>
                                        <td>${String(w).padStart(2,"0")+"/"+String($).padStart(2,"0")}</td>
                                        <td style="color:var(--txt2);font-family:sans-serif;font-size:12px;">${M}</td>
                                        <td>${v(o.restoran)}</td>
                                        <td>${v(o.cafetarya)}</td>
                                        <td style="font-weight:700;${r?"color:var(--orange);":""}">${v(o.total)}</td>
                                    </tr>`}).join("")}
                            </tbody>
                        </table>
                    </div>

                    ${b.length>0?`
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
                                    ${b.map(o=>{const[r,f,$]=o.date.split("-").map(Number),w=new Date(r,f-1,$).toLocaleDateString("tr-TR",{weekday:"short"});return`<tr>
                                            <td>${String($).padStart(2,"0")+"/"+String(f).padStart(2,"0")}</td>
                                            <td style="color:var(--txt2);font-size:12px;">${w}</td>
                                            <td style="font-weight:700;color:var(--cyan);">${v(o.balik)}</td>
                                        </tr>`}).join("")}
                                    <tr style="border-top:2px solid rgba(6,182,212,.3);">
                                        <td colspan="2" style="font-weight:600;color:var(--txt2);">Aylık Toplam</td>
                                        <td style="font-weight:700;color:var(--cyan);">${v(b.reduce((o,r)=>o+r.balik,0))}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>`:""}
                `}catch(t){e.innerHTML=`<div style="text-align:center;padding:40px;color:var(--red);">⚠️ Veri yüklenirken hata: ${t.message}</div>`}};window.closeVerimlilik=function(){document.getElementById("verimlilikModal").style.display="none"};document.getElementById("verimlilikModal").addEventListener("click",function(e){e.target===this&&closeVerimlilik()});function H(e){if(!e)return"-";const t=e.split("T")[0].split("-");return t.length===3?t[2]+"."+t[1]:e}function V(e){return e?new Date(e).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"}):"-"}function ft(e){return e?e.split(" ").map(t=>t[0]).join(""):"??"}function bt(e){if(!e)return"t";const t=e.split(" ")[0];return{Tuba:"t",Elif:"e",Melda:"m",Ceren:"c"}[t]||"t"}function j(e){return{yeni:"🌱 Yeni",bronz:"🥉 Bronz",gumus:"🥈 Gümüş",altin:"🥇 Altın",elmas:"💎 Elmas",efsane:"👑 Efsane",efsane_plus:"👑⭐ Süper Efsane",ozel_yildiz:"🌟 Yılın Yıldızı",ozel_ates:"🔥 Ateş Çıkışlı",ozel_roket:"🚀 Hızlı Yükseliş",ozel_onur:"🏅 Onur Madalyası",ozel_takim:"🤝 Takım Ruhu"}[e]||"🌱 Yeni"}window.assignBadge=async function(e,t){const a=[{key:"ozel_yildiz",icon:"🌟",name:"Yılın Yıldızı",desc:"En parlak performans"},{key:"ozel_ates",icon:"🔥",name:"Ateş Çıkışlı",desc:"Haftanın en iyisi"},{key:"ozel_roket",icon:"🚀",name:"Hızlı Yükseliş",desc:"En hızlı gelişim"},{key:"ozel_onur",icon:"🏅",name:"Onur Madalyası",desc:"Olağanüstü hizmet"},{key:"ozel_takim",icon:"🤝",name:"Takım Ruhu",desc:"Ekip çalışması"}],n=document.createElement("div");n.className="badge-modal-overlay",n.innerHTML=`
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
                </div>`,document.body.appendChild(n)};window.selectBadgeOption=function(e,t){document.querySelectorAll(".badge-option").forEach(a=>a.classList.remove("selected")),e.classList.add("selected"),e.closest(".badge-modal-overlay").__selectedBadge=t};window.saveBadgeAssignment=async function(e){const t=document.querySelector(".badge-modal-overlay"),a=t==null?void 0:t.__selectedBadge;if(!a){alert("Lütfen bir rozet seçin.");return}try{let n=a;if(a==="auto"){const{data:s}=await _.from("cashiers").select("total_points").eq("id",e).single(),l=(s==null?void 0:s.total_points)||0;l>=600?n="efsane_plus":l>=400?n="efsane":l>=250?n="elmas":l>=150?n="altin":l>=75?n="gumus":l>=30?n="bronz":n="yeni"}const{error:i}=await _.from("cashiers").update({badge_level:n}).eq("id",e);if(i)throw i;t.remove(),A(`✅ Rozet atandı: ${j(n)}`,"success"),await loadDashboard()}catch(n){console.error("Rozet atama hatası:",n),alert("❌ Hata: "+n.message)}};window.toggleDetails=function(){const e=document.getElementById("detailedSection"),t=document.getElementById("toggleIcon"),a=document.getElementById("toggleText");e&&(e.style.display==="none"?(e.style.display="block",t.textContent="🙈",a.textContent="Detaylı Verileri Gizle"):(e.style.display="none",t.textContent="👁️",a.textContent="Detaylı Verileri Göster"))};window.setDateFilter=function(e){u=e,S=null,F=null,document.querySelectorAll(".filter-btn").forEach(c=>c.classList.remove("active"));const t=document.querySelector(`[data-range="${e}"]`);t&&t.classList.add("active");const a=new Date,n=a.toLocaleDateString("tr-TR",{month:"long",year:"numeric"}),s=new Date(a.getFullYear(),a.getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"}),l={week:"Son 7 gün",month:`Bu Ay (${n})`,lastmonth:`Geçen Ay (${s})`,all:"Tüm veriler"},p=document.getElementById("filterInfo");p&&(p.textContent=l[e]||""),window.loadDashboard()};window.showDayPicker=function(){const e=document.createElement("div");e.className="custom-date-modal",e.style.display="flex",e.id="dayPickerModal",e.innerHTML=`
                <div class="custom-date-box">
                    <div class="custom-date-header">
                        <h3>📅 Belirli Gün Seçin</h3>
                        <button onclick="document.getElementById('dayPickerModal').remove()" class="close-btn">✕</button>
                    </div>
                    <div class="custom-date-content">
                        <div class="date-input-group">
                            <label>Tarih Seçin</label>
                            <input type="date" id="singleDayPicker" max="${k(new Date)}" />
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
            `,document.body.appendChild(e),document.getElementById("singleDayPicker").value=z||k(new Date)};window.applyDayFilter=function(){const e=document.getElementById("singleDayPicker"),t=e==null?void 0:e.value;if(!t){alert("⚠️ Lütfen bir tarih seçin!");return}z=t,u="day",S=null,F=null,document.querySelectorAll(".filter-btn").forEach(l=>l.classList.remove("active"));const a=document.querySelector('[data-range="day"]');a&&a.classList.add("active");const n=new Date(t).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}),i=document.getElementById("filterInfo");i&&(i.textContent=n);const s=document.getElementById("dayPickerModal");s&&s.remove(),window.loadDashboard()};window.showCustomDatePicker=function(){const e=document.getElementById("customDateModal"),t=k(new Date);if(document.getElementById("customStartDate").max=t,document.getElementById("customEndDate").max=t,S)document.getElementById("customStartDate").value=S;else{const a=new Date;a.setDate(a.getDate()-7),document.getElementById("customStartDate").value=k(a)}document.getElementById("customEndDate").value=F||t,e.style.display="flex"};window.closeCustomDatePicker=function(){document.getElementById("customDateModal").style.display="none"};window.applyCustomDateRange=function(){const e=document.getElementById("customStartDate").value,t=document.getElementById("customEndDate").value;if(!e||!t){alert("⚠️ Lütfen başlangıç ve bitiş tarihlerini seçin!");return}if(e>t){alert("⚠️ Başlangıç tarihi bitiş tarihinden sonra olamaz!");return}S=e,F=t,u="custom",document.querySelectorAll(".filter-btn").forEach(l=>l.classList.remove("active"));const a=document.querySelector('[data-range="custom"]');a&&a.classList.add("active");const n=new Date(e).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),i=new Date(t).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),s=document.getElementById("filterInfo");s&&(s.textContent=`${n} - ${i}`),window.closeCustomDatePicker(),window.loadDashboard()};window.loadDashboard=async function(){try{document.getElementById("mainContent").innerHTML=`
                    <div class="loading">
                        <div class="spinner"></div>
                        <div>Veriler yükleniyor...</div>
                    </div>
                `;const{weekly:e,reports:t,cashiers:a}=await U();K=t,await mt(e,t,a)}catch(e){console.error("Dashboard yükleme hatası:",e),document.getElementById("mainContent").innerHTML=`
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
            `,document.body.appendChild(t)};window.confirmDelete=async function(e){const t=document.querySelector(".modal-overlay");try{console.log("Siliniyor:",e);const{data:a,error:n}=await _.from("daily_reports").delete().eq("id",e);if(console.log("Delete response:",{data:a,error:n}),n)throw new Error(n.message);t&&t.remove(),A("✅ Kayıt başarıyla silindi!","success"),await loadDashboard()}catch(a){console.error("Silme hatası:",a),A("❌ Silme başarısız: "+a.message,"error"),t&&t.remove()}};window.editEntry=async function(e){console.log("editEntry çağrıldı:",e);const{data:t,error:a}=await _.from("daily_reports").select("*").eq("id",e).single();if(a){A("❌ Kayıt bulunamadı","error");return}const n=document.createElement("div");n.className="modal-overlay";const i=t.kasa==="cafetarya",s=t.kasa==="restoran";n.innerHTML=`
                <div class="modal-box" style="max-width:600px;">
                    <div class="modal-title">✏️ Kaydı Düzenle</div>
                    <div class="modal-content">
                        <div style="display:grid;gap:12px;">
                            <div style="background:var(--input);border-radius:8px;padding:10px;font-size:12px;color:var(--txt2);">
                                📅 ${t.date} · ${t.kasa} · ${t.shift==="sabah"?"🌅 Sabah":"🌙 Akşam"}
                            </div>
                            ${s?`
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
                        <button class="modal-btn confirm" style="background:var(--acc);" onclick="confirmEdit('${e}', '${t.kasa}')">
                            Kaydet
                        </button>
                    </div>
                </div>
            `,document.body.appendChild(n)};window.confirmEdit=async function(e,t){const a=document.querySelector(".modal-overlay");try{const n=parseInt(document.getElementById("editPuan").value)||0,i=document.getElementById("editDurum").value==="true",s=document.getElementById("editZ1"),l=document.getElementById("editZ2"),p=document.getElementById("editBalik"),c=document.getElementById("editDondurma"),d=s?parseFloat(s.value)||0:null,g=l?parseFloat(l.value)||0:null,x=p?parseFloat(p.value)||0:null,y=c?parseFloat(c.value)||0:null,R=(d??0)+(g??0)+(x??0)+(y??0),h={points_earned:n,is_on_time:i,total_revenue:R};d!==null&&(h.rumeli_z1=d),g!==null&&(h.rumeli_z2=g),x!==null&&(h.balik_ekmek=x),y!==null&&(h.dondurma=y),console.log("Güncelleniyor:",{entryId:e,kasa:t,updatePayload:h});const{error:B}=await _.from("daily_reports").update(h).eq("id",e);if(B)throw B;const{data:b}=await _.from("daily_reports").select("cashier_id").eq("id",e).single();if(!b)throw new Error("Kayıt bulunamadı");const{data:I}=await _.from("daily_reports").select("points_earned").eq("cashier_id",b.cashier_id),C=I.reduce((r,f)=>r+(parseInt(f.points_earned)||0),0);console.log("Toplam puan:",C);let T="yeni";C>=1e3?T="efsane":C>=500?T="elmas":C>=300?T="altin":C>=150?T="gumus":C>=50&&(T="bronz");const{error:o}=await _.from("cashiers").update({total_points:C,badge_level:T}).eq("id",b.cashier_id);if(o)throw o;a&&a.remove(),A("✅ Kayıt ve kasiyer puanı güncellendi!","success"),await loadDashboard()}catch(n){console.error("Güncelleme hatası:",n),A("❌ Güncelleme başarısız: "+n.message,"error"),a&&a.remove()}};function A(e,t="success"){const a=document.createElement("div");a.style.cssText=`
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
