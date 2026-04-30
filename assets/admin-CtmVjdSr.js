import"./modulepreload-polyfill-B5Qt9EMX.js";import{supabase as _}from"./supabase-client-Cz_bCqFO.js";import"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";typeof window._adminLoadOk=="function"&&window._adminLoadOk();let y="month",S=null,F=null,z=null;function w(a){return a.getFullYear()+"-"+String(a.getMonth()+1).padStart(2,"0")+"-"+String(a.getDate()).padStart(2,"0")}async function U(){let a,t=null;const e=new Date;if(y==="day"&&z)a=z,t=z;else if(y==="custom"&&S&&F)a=S,t=F;else switch(y){case"week":const l=new Date;l.setDate(l.getDate()-7),a=w(l);break;case"month":a=w(new Date(e.getFullYear(),e.getMonth(),1)),t=w(new Date(e.getFullYear(),e.getMonth()+1,0));break;case"lastmonth":a=w(new Date(e.getFullYear(),e.getMonth()-1,1)),t=w(new Date(e.getFullYear(),e.getMonth(),0));break;case"all":a="2020-01-01";break;default:a=w(new Date(e.getFullYear(),e.getMonth(),1)),t=w(new Date(e.getFullYear(),e.getMonth()+1,0))}let s=_.from("daily_reports").select("*, cashiers(name)").gte("date",a).order("date",{ascending:!1});t&&(s=s.lte("date",t));const[i,n]=await Promise.all([s,_.from("cashiers").select("*").order("total_points",{ascending:!1})]);return{weekly:[],reports:i.data||[],cashiers:n.data||[]}}function Q(a){const t={},e={};let s=0,i=0,n=0;a.forEach(d=>{if(d.kasa==="ana_kasa"||d.kasa==="iki_kasa"){const u=`${d.date}-${d.kasa}`;(!t[u]||d.shift==="aksam")&&(t[u]=d)}else d.kasa==="tek_kasa"?(!e[d.date]||d.shift==="aksam")&&(e[d.date]=d):(s+=parseFloat(d.rumeli_z1||0)+parseFloat(d.rumeli_z2||0),i+=parseFloat(d.balik_ekmek||0),n+=parseFloat(d.dondurma||0))});const l=Object.values(t).reduce((d,u)=>(d.z+=parseFloat(u.rumeli_z1||0),d.balik+=parseFloat(u.balik_ekmek||0),d.dond+=parseFloat(u.dondurma||0),d),{z:0,balik:0,dond:0}),p=Object.values(e).reduce((d,u)=>(d.z+=parseFloat(u.rumeli_z1||0),d.balik+=parseFloat(u.balik_ekmek||0),d.dond+=parseFloat(u.dondurma||0),d),{z:0,balik:0,dond:0}),c=l.z+p.z+s,g=l.balik+p.balik+i,f=l.dond+p.dond+n;return{zRaporu:c,balik:g,dondurma:f,total:c+g+f,restoran:0,cafetarya:0}}function J(a,t){const e={};return t.forEach(s=>{e[s.id]={cashier_id:s.id,name:s.name,badge_level:s.badge_level,total_score:0,entry_count:0,on_time_count:0}}),a.forEach(s=>{var l;const i=s.cashier_id;if(!e[i]){const p=((l=s.cashiers)==null?void 0:l.name)||"Bilinmiyor";e[i]={cashier_id:i,name:p,badge_level:null,total_score:0,entry_count:0,on_time_count:0}}const n=(s.is_on_time?50:0)+(parseFloat(s.rumeli_z1||0)>0||parseFloat(s.total_revenue||0)>0?50:0);e[i].total_score+=n,e[i].entry_count+=1,s.is_on_time&&(e[i].on_time_count+=1)}),Object.values(e).map(s=>({...s,performance_pct:s.entry_count>=1?Math.round(s.total_score/(s.entry_count*100)*100):null})).sort((s,i)=>s.performance_pct===null&&i.performance_pct===null?0:s.performance_pct===null?1:i.performance_pct===null?-1:i.performance_pct!==s.performance_pct?i.performance_pct-s.performance_pct:i.entry_count-s.entry_count)}function G(a){const t={};a.forEach(i=>{const n=`${i.date}-${i.kasa||"x"}`;(!t[n]||i.shift==="aksam")&&(t[n]=i)});const e={};Object.values(t).forEach(i=>{e[i.date]||(e[i.date]=0),e[i.date]+=parseFloat(i.rumeli_z1||0)+parseFloat(i.rumeli_z2||0)+parseFloat(i.balik_ekmek||0)+parseFloat(i.dondurma||0)});const s=Object.keys(e).sort();return{labels:s.map(i=>H(i)),data:s.map(i=>e[i])}}function X(a){const t={sabah:0,aksam:0};return a.forEach(e=>{const s=parseFloat(e.individual_revenue||0);e.shift==="sabah"?t.sabah+=s:e.shift==="aksam"&&(t.aksam+=s)}),t}function tt(a,t){const e={};return a.forEach(s=>{var n;const i=((n=s.cashiers)==null?void 0:n.name)||"Bilinmiyor";e[i]||(e[i]=0),e[i]+=parseFloat(s.individual_revenue||0)}),e}function at(a,t){const e=w(new Date),s=a.filter(g=>g.date===e),i=[...new Set(s.map(g=>g.cashier_id))],n=t.filter(g=>!i.includes(g.id)),l=a.filter(g=>!g.is_on_time),p=G(a),c=Math.max(...p.data,0);return{notEntered:n,lateEntries:l,maxCiro:c}}function et(a){const t=G(a),e=Math.max(...t.data,0),s=w(new Date),i=a.filter(g=>g.date===s),l=[...new Set(i.map(g=>g.cashier_id))].length;return{maxDailyCiro:e,activeCashiers:l,avgEntryTime:"2.5dk",weeklyGrowth:"+12%"}}function it(){const a=new Date,t=a.getDay(),e=["2026-01-01","2026-04-23","2026-05-01","2026-05-19","2026-08-30","2026-10-29"],s=w(a);return e.includes(s)?"special":t===0||t===6?"weekend":"weekday"}async function st(){try{const a=it();console.log("Hedef tipi:",a);const{data:t,error:e}=await _.from("targets").select("amount").eq("target_type",a).single();return e?(console.error("Hedef çekme hatası:",e),{weekday:15e4,weekend:2e5,special:25e4}[a]):(console.log("Çekilen hedef:",t.amount),parseFloat(t.amount)||15e4)}catch(a){return console.error("fetchDailyTarget hatası:",a),15e4}}function nt(){typeof anime>"u"||(anime({targets:".kasa-card, .sc, .total-hero-card",opacity:[0,1],translateY:[40,0],delay:anime.stagger(100),duration:800,easing:"easeOutCubic"}),anime({targets:".rank-card",opacity:[0,1],translateX:[-40,0],delay:anime.stagger(120),duration:700,easing:"easeOutCubic"}))}function ot(){if(typeof anime>"u")return;const a=document.getElementById("totalDailyCiro"),t=parseFloat(a.getAttribute("data-value")||0);anime({targets:{value:0},value:t,duration:2e3,easing:"easeOutExpo",update:function(i){a.textContent=v(i.animations[0].currentValue)}});const e=document.getElementById("progressBarFill"),s=parseFloat(e.getAttribute("data-percent")||0);anime({targets:"#progressBarFill",width:s+"%",duration:1500,easing:"easeInOutQuad"})}function lt(a){const t={gida:{name:"Gıda",icon:"🥗",total:0,color:"#22c55e"},kahvalti:{name:"Kahvaltı",icon:"🥐",total:0,color:"#f59e0b"},kahve:{name:"Kahve",icon:"☕",total:0,color:"#8b5cf6"},meyvesuyu:{name:"Meyve Suyu",icon:"🧃",total:0,color:"#ec4899"},salata:{name:"Salata",icon:"🥙",total:0,color:"#06b6d4"},sicak_icecek:{name:"Sıcak İçecek",icon:"🔥",total:0,color:"#ef4444"},soguk_icecek:{name:"Soğuk İçecek",icon:"🥤",total:0,color:"#3b82f6"},tatli:{name:"Tatlı",icon:"🍰",total:0,color:"#a855f7"},dondurma_kategori:{name:"Dondurma",icon:"🍦",total:0,color:"#06b6d4"}},e={};a.forEach(n=>{const l=`${n.date}-${n.kasa}`;(!e[l]||n.shift==="aksam")&&(e[l]=n)}),Object.values(e).forEach(n=>{t.gida.total+=parseFloat(n.gida)||0,t.kahvalti.total+=parseFloat(n.kahvalti)||0,t.kahve.total+=parseFloat(n.kahve)||0,t.meyvesuyu.total+=parseFloat(n.meyvesuyu)||0,t.salata.total+=parseFloat(n.salata)||0,t.sicak_icecek.total+=parseFloat(n.sicak_icecek)||0,t.soguk_icecek.total+=parseFloat(n.soguk_icecek)||0,t.tatli.total+=parseFloat(n.tatli)||0,t.dondurma_kategori.total+=parseFloat(n.dondurma_kategori)||0});const s=Object.values(t).reduce((n,l)=>n+l.total,0);Object.values(t).forEach(n=>{n.percentage=s>0?n.total/s*100:0});const i=Object.entries(t).map(([n,l])=>({key:n,...l})).sort((n,l)=>l.total-n.total);return{categories:i,total:s,highest:i[0],lowest:i[i.length-1],average:s/i.length}}function rt(a){return a.categories.map(t=>`
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
            `).join("")}function dt(a){var e;const t=((e=a.categories[0])==null?void 0:e.total)||1;return a.categories.map(s=>{const i=t>0?s.total/t*100:0;return`
                    <div class="category-bar">
                        <div class="category-bar-label">${s.icon} ${s.name}</div>
                        <div class="category-bar-track">
                            <div class="category-bar-fill" style="width:${i}%;background:${s.color};">
                                ${L(s.total)}
                            </div>
                        </div>
                    </div>
                `}).join("")}function ct(a){return`
                <div class="category-summary-card">
                    <div class="summary-icon">🏆</div>
                    <div class="summary-label">En Çok Satan</div>
                    <div class="summary-value">${a.highest.icon} ${a.highest.name}</div>
                    <div style="font-size:12px;color:var(--acc);margin-top:4px;font-weight:600;">${L(a.highest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📉</div>
                    <div class="summary-label">En Az Satan</div>
                    <div class="summary-value">${a.lowest.icon} ${a.lowest.name}</div>
                    <div style="font-size:12px;color:var(--txt3);margin-top:4px;font-weight:600;">${L(a.lowest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📊</div>
                    <div class="summary-label">Kategori Ort.</div>
                    <div class="summary-value">${L(a.average)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">Kategori başına</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">💰</div>
                    <div class="summary-label">Kategori Toplamı</div>
                    <div class="summary-value">${L(a.total)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">9 kategori</div>
                </div>
            `}async function mt(a,t,e){const s=await st(),i=Q(t),n=G(t),l=X(t),p=tt(t),c=at(t,e),g=et(t),f=lt(t),d=J(t,e),u=d.length>0&&d[0].entry_count>0?d[0]:null,R=t.length,k=t.filter(m=>m.is_on_time).length,T=R>0?Math.round(k/R*100):0,h=[...new Set(t.map(m=>m.date))].length,I=h>0?i.total/h:0,B=i.total,C=y==="day"&&z?z:w(new Date),o={};t.filter(m=>m.date===C).forEach(m=>{const D=`${m.date}-${m.kasa}`;(!o[D]||m.shift==="aksam")&&(o[D]=m)});const r=Object.values(o).reduce((m,D)=>m+parseFloat(D.total_revenue||0),0),b=s>0?Math.min(100,Math.round(r/s*100)):0,$=y==="week"?"Bu Hafta":y==="month"?`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long"})})`:y==="lastmonth"?`Geçen Ay (${new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long"})})`:y==="all"?"Tüm Veriler":y==="day"&&z?new Date(z).toLocaleDateString("tr-TR",{day:"numeric",month:"short"}):S?`${new Date(S).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"})} - ${new Date(F).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"})}`:"Bu Ay";document.getElementById("mainContent").innerHTML=`

            <!-- TARİH FİLTRESİ -->
            <div class="date-filter-section">
                <div class="filter-label">📅 Tarih Aralığı:</div>
                <div class="filter-buttons">
                    <button class="filter-btn ${y==="month"?"active":""}" data-range="month" onclick="setDateFilter('month')">Bu Ay</button>
                    <button class="filter-btn ${y==="lastmonth"?"active":""}" data-range="lastmonth" onclick="setDateFilter('lastmonth')">Geçen Ay</button>
                    <button class="filter-btn ${y==="week"?"active":""}" data-range="week" onclick="setDateFilter('week')">Bu Hafta</button>
                    <button class="filter-btn ${y==="all"?"active":""}" data-range="all" onclick="setDateFilter('all')">Tümü</button>
                    <button class="filter-btn ${y==="day"?"active":""}" data-range="day" onclick="showDayPicker()">📅 Belirli Gün</button>
                    <button class="filter-btn ${y==="custom"?"active":""}" data-range="custom" onclick="showCustomDatePicker()">Özel Aralık ▼</button>
                </div>
                <div class="filter-info" id="filterInfo">
                    ${y==="week"?"Son 7 gün":y==="month"?`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`:y==="lastmonth"?`Geçen Ay (${new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`:y==="all"?"Tüm veriler":y==="day"&&z?new Date(z).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}):S?`${new Date(S).toLocaleDateString("tr-TR")} - ${new Date(F).toLocaleDateString("tr-TR")}`:`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`}
                </div>
            </div>

            <!-- GÜNLÜK TOPLAM HERO KARTI -->
            <div class="section-title">💰 Rumeli İskelesi Toplam Ciro</div>
            <div class="total-hero-card">
                <div class="total-hero-left">
                    <div class="total-hero-label">${y==="month"?"Bu Ay Toplam Ciro":y==="week"?"Bu Hafta Toplam Ciro":y==="day"?"Günlük Toplam Ciro":"Dönem Toplam Ciro"}</div>
                    <div class="total-hero-amount" id="totalDailyCiro" data-value="${B}">0,00 ₺</div>
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
                            <div class="progress-bar-fill" id="progressBarFill" style="width:0%" data-percent="${b}"></div>
                        </div>
                        <div class="progress-percent" id="progressPercent">Günlük Ort: ${v(h>0?i.total/h:0)}</div>
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
                    <div class="sc-l">${y==="month"?"Bu Ay Toplam Ciro":y==="week"?"Bu Hafta Toplam Ciro":y==="day"?"Günlük Toplam Ciro":"Dönem Toplam Ciro"}</div>
                    <div class="sc-v">${v(i.total)}</div>
                    <div class="sc-s">${h} günlük veri</div>
                </div>
                <div class="sc purple">
                    <div class="sc-l">Günlük Ortalama (Tüm)</div>
                    <div class="sc-v">${v(I)}</div>
                    <div class="sc-s">Son ${h} gün</div>
                </div>
                <div class="sc emerald">
                    <div class="sc-l">🏪 Rumeli İskelesi Toplam</div>
                    <div class="sc-v">${v(i.zRaporu)}</div>
                    <div class="sc-s">Kasa toplamı</div>
                </div>
                <div class="sc cyan">
                    <div class="sc-l">🏪 Rumeli İskelesi Günlük Ort.</div>
                    <div class="sc-v">${v(h>0?i.zRaporu/h:0)}</div>
                    <div class="sc-s">${h} günlük ortalama</div>
                </div>
                <div class="sc orange">
                    <div class="sc-l">Zamanında Giriş</div>
                    <div class="sc-v">%${T}</div>
                    <div class="sc-s">${k}/${R} giriş</div>
                </div>
                <div class="sc green">
                    <div class="sc-l">Toplam Giriş Sayısı</div>
                    <div class="sc-v">${R}</div>
                    <div class="sc-s">${h} günlük</div>
                </div>
                <div class="sc pink">
                    <div class="sc-l">En Yüksek Günlük Ciro</div>
                    <div class="sc-v" id="maxDailyCiro">${v(g.maxDailyCiro)}</div>
                    <div class="sc-s">Dönem rekoru</div>
                </div>
                <div class="sc indigo">
                    <div class="sc-l">Aktif Kasiyer</div>
                    <div class="sc-v" id="activeCashiers">${g.activeCashiers}/${e.length}</div>
                    <div class="sc-s">Bugün giriş yapan</div>
                </div>
            </div>

            <!-- KATEGORİ SATIŞ ANALİZİ -->
            <div class="section-title">🏷️ Kategori Bazlı Satış Analizi</div>

            <!-- Kategori Kartları -->
            <div class="category-cards-grid">
                ${rt(f)}
            </div>

            <!-- Kategori Grafikler + Özet -->
            <div class="category-charts">
                <div class="category-chart-box">
                    <div class="chart-title">📊 Kategori Karşılaştırması</div>
                    ${dt(f)}
                </div>
                <div class="category-chart-box">
                    <div class="chart-title">📋 Özet İstatistikler</div>
                    <div class="category-summary">
                        ${ct(f)}
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
                        <span style="color:var(--orange)">${a.reduce((m,D)=>m+(D.weekly_points||0),0)}</span>
                    </div>
                    <div class="alert-item">
                        <span>Aktif Kasiyer</span>
                        <span style="color:var(--green)">${a.filter(m=>(m.total_entries||0)>0).length}/${e.length}</span>
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
                            ${e.map(m=>`<option value="${m.id}">${m.name}</option>`).join("")}
                        </select>
                        <select id="filterKasa" class="fsel">
                            <option value="">Tüm Kasalar</option>
                            <option value="ana_kasa">Ana Kasa</option>
                            <option value="iki_kasa">2. Kasa</option>
                            <option value="tek_kasa">Eski: Tek Kasa</option>
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
                ${d.map((m,D)=>{const P=e.find(W=>W.id===m.cashier_id)||{},Y=P.id||"",q=j(P.badge_level),N=m.performance_pct!==null?m.performance_pct:"—",Z=m.performance_pct>=85?"var(--green)":m.performance_pct>=65?"var(--orange)":"var(--txt2)";return`
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
            <div id="heroSection" class="hero ${u&&u.performance_pct>0?"gold":"blue"}" style="margin-top:24px;">
                <div class="hero-badge">🏆 AYIN ELEMANI</div>
                <div class="hero-name">${u?u.name:"Henüz Veri Yok"}</div>
                <div class="hero-amt">%${u?u.performance_pct:0} Performans</div>
                <div class="hero-sub">
                    ${u?`${u.entry_count} giriş · ${u.on_time_count} zamanında`:"İlk veriyi girin!"}
                </div>
            </div>
        `,ut(n,i,l,p);const x=document.getElementById("applyFiltersBtn"),M=document.getElementById("clearFiltersBtn");x&&x.addEventListener("click",vt),M&&M.addEventListener("click",pt),document.getElementById("lastUpdate").textContent="Son güncelleme: "+new Date().toLocaleTimeString("tr-TR",{timeZone:"Europe/Istanbul"}),setTimeout(()=>{nt(),ot(),gt()},100),yt(s,r,b)}let E={};function ut(a,t,e,s){Chart.defaults.color="#7a8ba8",Chart.defaults.borderColor="#1e3a5f",Chart.defaults.font.family="DM Sans";const i=document.getElementById("dailyChart");i&&(E.daily&&E.daily.destroy(),E.daily=new Chart(i,{type:"bar",data:{labels:a.labels.length>0?a.labels:["Veri Yok"],datasets:[{label:"Günlük Ciro (₺)",data:a.data.length>0?a.data:[0],backgroundColor:"rgba(59,130,246,.7)",borderColor:"#3b82f6",borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:c=>"₺"+new Intl.NumberFormat("tr-TR").format(c)}}}}}));const n=document.getElementById("kasaChart");if(n){E.kasa&&E.kasa.destroy();const c=t.total>0,g=c?[t.zRaporu,t.balik,t.dondurma]:[.001,.001,.001];E.kasa=new Chart(n,{type:"doughnut",data:{labels:["Rumeli İskelesi","Balık Ekmek","Dondurma"],datasets:[{data:g,backgroundColor:["rgba(59,130,246,.8)","rgba(6,182,212,.8)","rgba(236,72,153,.8)"],borderColor:"#111d32",borderWidth:3,hoverOffset:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{position:"bottom",labels:{padding:16,usePointStyle:!0}},tooltip:{enabled:c,callbacks:{label:f=>{const d=f.raw,u=f.dataset.data.reduce((k,T)=>k+T,0),R=Math.round(d/u*100);return` ${f.label}: ${v(d)} (%${R})`}}}},cutout:"65%"}})}const l=document.getElementById("shiftChart");l&&(E.shift&&E.shift.destroy(),E.shift=new Chart(l,{type:"bar",data:{labels:["Sabah Vardiyası","Akşam Vardiyası"],datasets:[{label:"Ciro (₺)",data:[e.sabah||0,e.aksam||0],backgroundColor:["rgba(245,158,11,.7)","rgba(139,92,246,.7)"],borderColor:["#f59e0b","#8b5cf6"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:c=>"₺"+new Intl.NumberFormat("tr-TR").format(c)}}}}}));const p=document.getElementById("cashierChart");if(p){E.cashier&&E.cashier.destroy();const c=Object.keys(s),g=Object.values(s);E.cashier=new Chart(p,{type:"bar",data:{labels:c.length>0?c:["Veri Yok"],datasets:[{label:"Ciro (₺)",data:g.length>0?g:[0],backgroundColor:["rgba(139,92,246,.7)","rgba(245,158,11,.7)","rgba(236,72,153,.7)","rgba(34,197,94,.7)"],borderColor:["#8b5cf6","#f59e0b","#ec4899","#22c55e"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:f=>"₺"+new Intl.NumberFormat("tr-TR").format(f)}}}}})}}let K=[];function O(a){return a.length===0?'<tr><td colspan="9" style="text-align:center;color:var(--txt2);padding:40px;">Henüz veri yok</td></tr>':a.map(t=>{var i;const e=parseFloat(t.total_revenue||0),s=parseFloat(t.individual_revenue||e);return`
                <tr>
                    <td>${H(t.date)}</td>
                    <td style="font-weight:600">${((i=t.cashiers)==null?void 0:i.name)||"-"}</td>
                    <td><span class="badge ${t.kasa||""}">${t.kasa==="ana_kasa"?"🏦 Ana Kasa":t.kasa==="iki_kasa"?"🖥️ 2. Kasa":t.kasa==="tek_kasa"?"🏪 Tek Kasa":t.kasa==="restoran"?"🍽️ Restoran":t.kasa==="cafetarya"?"☕ Cafetarya":"-"}</span></td>
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
            `}).join("")}function vt(){const a=document.getElementById("filterDate").value,t=document.getElementById("filterKasiyer").value,e=document.getElementById("filterKasa").value,s=document.getElementById("filterVardiya").value;let i=[...K];a&&(i=i.filter(n=>n.date===a)),t&&(i=i.filter(n=>n.cashier_id===t)),e&&(i=i.filter(n=>n.kasa===e)),s&&(i=i.filter(n=>n.shift===s)),document.getElementById("entriesBody").innerHTML=O(i)}function pt(){document.getElementById("filterDate").value="",document.getElementById("filterKasiyer").value="",document.getElementById("filterKasa").value="",document.getElementById("filterVardiya").value="",document.getElementById("entriesBody").innerHTML=O(K)}function v(a){return new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(a||0)+" ₺"}function L(a){return v(a)}function gt(){document.querySelectorAll(".kasa-amount[data-target]").forEach(a=>{const t=parseFloat(a.dataset.target)||0,e=1200,s=performance.now();function i(n){const l=Math.min((n-s)/e,1),p=1-Math.pow(1-l,3);a.textContent=v(t*p),l<1?requestAnimationFrame(i):a.textContent=v(t)}requestAnimationFrame(i)})}function yt(a,t,e){const s=document.getElementById("floatingTarget");if(!s)return;s.style.display="block",document.getElementById("ftPct").textContent=e+"%",document.getElementById("ftTarget").textContent=v(a),document.getElementById("ftCurrent").textContent=v(t);const i=[[100,"🎉 Hedef Tamamlandı!"],[80,"💪 Hedefe Yakın!"],[50,"⏰ Yarı Yolda!"],[0,"🚀 Devam Edelim!"]];document.getElementById("ftStatus").textContent=(i.find(([l])=>e>=l)||i[3])[1];const n=document.getElementById("ftBar");n.classList.toggle("done",e>=100),n.classList.toggle("near",e>=80&&e<100),setTimeout(()=>{n.style.width=Math.min(100,e)+"%"},200)}window.showVerimlilik=async function(){document.getElementById("verimlilikModal").style.display="flex";const a=document.getElementById("verimlilikBody");a.innerHTML='<div class="loading" style="padding:40px 0;"><div class="spinner"></div><div>Veriler hesaplanıyor...</div></div>';try{const t=new Date,e=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-01`,s=new Date(t.getFullYear(),t.getMonth()+1,0).getDate(),i=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${s}`,{data:n}=await _.from("daily_reports").select("date, kasa, shift, rumeli_z1, rumeli_z2, balik_ekmek, dondurma").in("kasa",["restoran","cafetarya"]).gte("date",e).lte("date",i).order("date",{ascending:!0});if(!n||n.length===0){a.innerHTML='<div style="text-align:center;padding:40px;color:var(--txt2);">Bu ay için veri bulunamadı.</div>';return}const l={};n.forEach(o=>{const r=`${o.date}-${o.kasa}`;if(!l[r])l[r]=o;else{const b=l[r],$=o.kasa==="restoran"?parseFloat(o.rumeli_z2):parseFloat(o.rumeli_z1),x=b.kasa==="restoran"?parseFloat(b.rumeli_z2):parseFloat(b.rumeli_z1);(b.shift!=="aksam"&&o.shift==="aksam"||b.shift==="aksam"&&o.shift==="aksam"&&$>x)&&(l[r]=o)}});const p={};Object.values(l).forEach(o=>{p[o.date]||(p[o.date]={restoran:0,cafetarya:0,balik:0,dondurma:0}),o.kasa==="restoran"?p[o.date].restoran=parseFloat(o.rumeli_z2)||0:o.kasa==="cafetarya"&&(p[o.date].cafetarya=parseFloat(o.rumeli_z1)||0),p[o.date].balik+=parseFloat(o.balik_ekmek)||0,p[o.date].dondurma+=parseFloat(o.dondurma)||0});const c=Object.entries(p).map(([o,r])=>({date:o,total:(r.restoran||0)+(r.cafetarya||0),restoran:r.restoran||0,cafetarya:r.cafetarya||0,balik:r.balik||0,dondurma:r.dondurma||0})).sort((o,r)=>o.date.localeCompare(r.date)),g=c.reduce((o,r)=>o+r.total,0),f=c.length,d=f>0?g/f:0,u=c.reduce((o,r)=>r.total>o.total?r:o,c[0]),R=["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"],k={},T={};c.forEach(o=>{const[r,b,$]=o.date.split("-").map(Number),x=new Date(r,b-1,$).getDay();k[x]=(k[x]||0)+o.total,T[x]=(T[x]||0)+1});const h=c.filter(o=>o.balik>0),I=[0,1,2,3,4,5,6].filter(o=>T[o]).map(o=>({name:R[o],avg:k[o]/T[o],idx:o})).sort((o,r)=>r.avg-o.avg),B=I.length>0?I[0].avg:1,C=t.toLocaleDateString("tr-TR",{month:"long",year:"numeric"});a.innerHTML=`
                    <div class="ver-stats-grid">
                        <div class="ver-stat-card">
                            <div class="ver-stat-label">🏢 Rumeli İskelesi Toplam</div>
                            <div class="ver-stat-value">${v(g)}</div>
                            <div class="ver-stat-sub">${C}</div>
                        </div>
                        <div class="ver-stat-card">
                            <div class="ver-stat-label">📅 Veri Günü</div>
                            <div class="ver-stat-value">${f} gün</div>
                            <div class="ver-stat-sub">Girişi olan günler</div>
                        </div>
                        <div class="ver-stat-card">
                            <div class="ver-stat-label">📊 Günlük Ortalama</div>
                            <div class="ver-stat-value">${v(d)}</div>
                            <div class="ver-stat-sub">Restoran + Cafetarya ortalaması</div>
                        </div>
                        <div class="ver-stat-card" style="border-color:var(--orange);">
                            <div class="ver-stat-label">🏆 En İyi Gün</div>
                            <div class="ver-stat-value">${v((u==null?void 0:u.total)||0)}</div>
                            <div class="ver-stat-sub">${u?(()=>{const[o,r,b]=u.date.split("-").map(Number);return new Date(o,r-1,b).toLocaleDateString("tr-TR",{day:"numeric",month:"long",weekday:"short"})})():"-"}</div>
                        </div>
                    </div>

                    <div class="ver-section-title">📈 Haftanın En İyi Günleri (Ortalamaya Göre)</div>
                    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px;">
                        ${I.map((o,r)=>`
                            <div style="display:flex;align-items:center;gap:12px;">
                                <div style="width:20px;text-align:right;font-size:12px;color:var(--txt2);">${r+1}.</div>
                                <div style="width:90px;font-size:13px;font-weight:600;">${o.name}</div>
                                <div style="flex:1;height:8px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;">
                                    <div style="height:100%;width:${Math.round(o.avg/B*100)}%;background:linear-gradient(90deg,${r===0?"#f59e0b,#f97316":"#3b82f6,#06b6d4"});border-radius:4px;transition:width 1s ease;"></div>
                                </div>
                                <div style="width:130px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;color:${r===0?"var(--orange)":"var(--txt)"};">${v(o.avg)}</div>
                            </div>
                        `).join("")}
                    </div>

                    <div class="ver-section-title">📋 Günlük Ciro Detayı — ${C}</div>
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
                                ${c.map(o=>{const r=o.date===(u==null?void 0:u.date),[b,$,x]=o.date.split("-").map(Number),M=new Date(b,$-1,x).toLocaleDateString("tr-TR",{weekday:"short"});return`<tr${r?' class="top-row"':""}>
                                        <td>${String(x).padStart(2,"0")+"/"+String($).padStart(2,"0")}</td>
                                        <td style="color:var(--txt2);font-family:sans-serif;font-size:12px;">${M}</td>
                                        <td>${v(o.restoran)}</td>
                                        <td>${v(o.cafetarya)}</td>
                                        <td style="font-weight:700;${r?"color:var(--orange);":""}">${v(o.total)}</td>
                                    </tr>`}).join("")}
                            </tbody>
                        </table>
                    </div>

                    ${h.length>0?`
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
                                    ${h.map(o=>{const[r,b,$]=o.date.split("-").map(Number),x=new Date(r,b-1,$).toLocaleDateString("tr-TR",{weekday:"short"});return`<tr>
                                            <td>${String($).padStart(2,"0")+"/"+String(b).padStart(2,"0")}</td>
                                            <td style="color:var(--txt2);font-size:12px;">${x}</td>
                                            <td style="font-weight:700;color:var(--cyan);">${v(o.balik)}</td>
                                        </tr>`}).join("")}
                                    <tr style="border-top:2px solid rgba(6,182,212,.3);">
                                        <td colspan="2" style="font-weight:600;color:var(--txt2);">Aylık Toplam</td>
                                        <td style="font-weight:700;color:var(--cyan);">${v(h.reduce((o,r)=>o+r.balik,0))}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>`:""}
                `}catch(t){a.innerHTML=`<div style="text-align:center;padding:40px;color:var(--red);">⚠️ Veri yüklenirken hata: ${t.message}</div>`}};window.closeVerimlilik=function(){document.getElementById("verimlilikModal").style.display="none"};document.getElementById("verimlilikModal").addEventListener("click",function(a){a.target===this&&closeVerimlilik()});function H(a){if(!a)return"-";const t=a.split("T")[0].split("-");return t.length===3?t[2]+"."+t[1]:a}function V(a){return a?new Date(a).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"}):"-"}function ft(a){return a?a.split(" ").map(t=>t[0]).join(""):"??"}function bt(a){if(!a)return"t";const t=a.split(" ")[0];return{Tuba:"t",Elif:"e",Melda:"m",Ceren:"c"}[t]||"t"}function j(a){return{yeni:"🌱 Yeni",bronz:"🥉 Bronz",gumus:"🥈 Gümüş",altin:"🥇 Altın",elmas:"💎 Elmas",efsane:"👑 Efsane",efsane_plus:"👑⭐ Süper Efsane",ozel_yildiz:"🌟 Yılın Yıldızı",ozel_ates:"🔥 Ateş Çıkışlı",ozel_roket:"🚀 Hızlı Yükseliş",ozel_onur:"🏅 Onur Madalyası",ozel_takim:"🤝 Takım Ruhu"}[a]||"🌱 Yeni"}window.assignBadge=async function(a,t){const e=[{key:"ozel_yildiz",icon:"🌟",name:"Yılın Yıldızı",desc:"En parlak performans"},{key:"ozel_ates",icon:"🔥",name:"Ateş Çıkışlı",desc:"Haftanın en iyisi"},{key:"ozel_roket",icon:"🚀",name:"Hızlı Yükseliş",desc:"En hızlı gelişim"},{key:"ozel_onur",icon:"🏅",name:"Onur Madalyası",desc:"Olağanüstü hizmet"},{key:"ozel_takim",icon:"🤝",name:"Takım Ruhu",desc:"Ekip çalışması"}],s=document.createElement("div");s.className="badge-modal-overlay",s.innerHTML=`
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
                </div>`,document.body.appendChild(s)};window.selectBadgeOption=function(a,t){document.querySelectorAll(".badge-option").forEach(e=>e.classList.remove("selected")),a.classList.add("selected"),a.closest(".badge-modal-overlay").__selectedBadge=t};window.saveBadgeAssignment=async function(a){const t=document.querySelector(".badge-modal-overlay"),e=t==null?void 0:t.__selectedBadge;if(!e){alert("Lütfen bir rozet seçin.");return}try{let s=e;if(e==="auto"){const{data:n}=await _.from("cashiers").select("total_points").eq("id",a).single(),l=(n==null?void 0:n.total_points)||0;l>=600?s="efsane_plus":l>=400?s="efsane":l>=250?s="elmas":l>=150?s="altin":l>=75?s="gumus":l>=30?s="bronz":s="yeni"}const{error:i}=await _.from("cashiers").update({badge_level:s}).eq("id",a);if(i)throw i;t.remove(),A(`✅ Rozet atandı: ${j(s)}`,"success"),await loadDashboard()}catch(s){console.error("Rozet atama hatası:",s),alert("❌ Hata: "+s.message)}};window.toggleDetails=function(){const a=document.getElementById("detailedSection"),t=document.getElementById("toggleIcon"),e=document.getElementById("toggleText");a&&(a.style.display==="none"?(a.style.display="block",t.textContent="🙈",e.textContent="Detaylı Verileri Gizle"):(a.style.display="none",t.textContent="👁️",e.textContent="Detaylı Verileri Göster"))};window.setDateFilter=function(a){y=a,S=null,F=null,document.querySelectorAll(".filter-btn").forEach(c=>c.classList.remove("active"));const t=document.querySelector(`[data-range="${a}"]`);t&&t.classList.add("active");const e=new Date,s=e.toLocaleDateString("tr-TR",{month:"long",year:"numeric"}),n=new Date(e.getFullYear(),e.getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"}),l={week:"Son 7 gün",month:`Bu Ay (${s})`,lastmonth:`Geçen Ay (${n})`,all:"Tüm veriler"},p=document.getElementById("filterInfo");p&&(p.textContent=l[a]||""),window.loadDashboard()};window.showDayPicker=function(){const a=document.createElement("div");a.className="custom-date-modal",a.style.display="flex",a.id="dayPickerModal",a.innerHTML=`
                <div class="custom-date-box">
                    <div class="custom-date-header">
                        <h3>📅 Belirli Gün Seçin</h3>
                        <button onclick="document.getElementById('dayPickerModal').remove()" class="close-btn">✕</button>
                    </div>
                    <div class="custom-date-content">
                        <div class="date-input-group">
                            <label>Tarih Seçin</label>
                            <input type="date" id="singleDayPicker" max="${w(new Date)}" />
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
            `,document.body.appendChild(a),document.getElementById("singleDayPicker").value=z||w(new Date)};window.applyDayFilter=function(){const a=document.getElementById("singleDayPicker"),t=a==null?void 0:a.value;if(!t){alert("⚠️ Lütfen bir tarih seçin!");return}z=t,y="day",S=null,F=null,document.querySelectorAll(".filter-btn").forEach(l=>l.classList.remove("active"));const e=document.querySelector('[data-range="day"]');e&&e.classList.add("active");const s=new Date(t).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}),i=document.getElementById("filterInfo");i&&(i.textContent=s);const n=document.getElementById("dayPickerModal");n&&n.remove(),window.loadDashboard()};window.showCustomDatePicker=function(){const a=document.getElementById("customDateModal"),t=w(new Date);if(document.getElementById("customStartDate").max=t,document.getElementById("customEndDate").max=t,S)document.getElementById("customStartDate").value=S;else{const e=new Date;e.setDate(e.getDate()-7),document.getElementById("customStartDate").value=w(e)}document.getElementById("customEndDate").value=F||t,a.style.display="flex"};window.closeCustomDatePicker=function(){document.getElementById("customDateModal").style.display="none"};window.applyCustomDateRange=function(){const a=document.getElementById("customStartDate").value,t=document.getElementById("customEndDate").value;if(!a||!t){alert("⚠️ Lütfen başlangıç ve bitiş tarihlerini seçin!");return}if(a>t){alert("⚠️ Başlangıç tarihi bitiş tarihinden sonra olamaz!");return}S=a,F=t,y="custom",document.querySelectorAll(".filter-btn").forEach(l=>l.classList.remove("active"));const e=document.querySelector('[data-range="custom"]');e&&e.classList.add("active");const s=new Date(a).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),i=new Date(t).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),n=document.getElementById("filterInfo");n&&(n.textContent=`${s} - ${i}`),window.closeCustomDatePicker(),window.loadDashboard()};window.loadDashboard=async function(){try{document.getElementById("mainContent").innerHTML=`
                    <div class="loading">
                        <div class="spinner"></div>
                        <div>Veriler yükleniyor...</div>
                    </div>
                `;const{weekly:a,reports:t,cashiers:e}=await U();K=t,await mt(a,t,e)}catch(a){console.error("Dashboard yükleme hatası:",a),document.getElementById("mainContent").innerHTML=`
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
            `,document.body.appendChild(t)};window.confirmDelete=async function(a){const t=document.querySelector(".modal-overlay");try{console.log("Siliniyor:",a);const{data:e,error:s}=await _.from("daily_reports").delete().eq("id",a);if(console.log("Delete response:",{data:e,error:s}),s)throw new Error(s.message);t&&t.remove(),A("✅ Kayıt başarıyla silindi!","success"),await loadDashboard()}catch(e){console.error("Silme hatası:",e),A("❌ Silme başarısız: "+e.message,"error"),t&&t.remove()}};window.editEntry=async function(a){console.log("editEntry çağrıldı:",a);const{data:t,error:e}=await _.from("daily_reports").select("*").eq("id",a).single();if(e){A("❌ Kayıt bulunamadı","error");return}const s=document.createElement("div");s.className="modal-overlay";const i=t.kasa==="cafetarya",n=t.kasa==="restoran";s.innerHTML=`
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
            `,document.body.appendChild(s)};window.confirmEdit=async function(a,t){const e=document.querySelector(".modal-overlay");try{const s=parseInt(document.getElementById("editPuan").value)||0,i=document.getElementById("editDurum").value==="true",n=document.getElementById("editZ1"),l=document.getElementById("editZ2"),p=document.getElementById("editBalik"),c=document.getElementById("editDondurma"),g=n?parseFloat(n.value)||0:null,f=l?parseFloat(l.value)||0:null,d=p?parseFloat(p.value)||0:null,u=c?parseFloat(c.value)||0:null,R=(g??0)+(f??0)+(d??0)+(u??0),k={points_earned:s,is_on_time:i,total_revenue:R};g!==null&&(k.rumeli_z1=g),f!==null&&(k.rumeli_z2=f),d!==null&&(k.balik_ekmek=d),u!==null&&(k.dondurma=u),console.log("Güncelleniyor:",{entryId:a,kasa:t,updatePayload:k});const{error:T}=await _.from("daily_reports").update(k).eq("id",a);if(T)throw T;const{data:h}=await _.from("daily_reports").select("cashier_id").eq("id",a).single();if(!h)throw new Error("Kayıt bulunamadı");const{data:I}=await _.from("daily_reports").select("points_earned").eq("cashier_id",h.cashier_id),B=I.reduce((r,b)=>r+(parseInt(b.points_earned)||0),0);console.log("Toplam puan:",B);let C="yeni";B>=1e3?C="efsane":B>=500?C="elmas":B>=300?C="altin":B>=150?C="gumus":B>=50&&(C="bronz");const{error:o}=await _.from("cashiers").update({total_points:B,badge_level:C}).eq("id",h.cashier_id);if(o)throw o;e&&e.remove(),A("✅ Kayıt ve kasiyer puanı güncellendi!","success"),await loadDashboard()}catch(s){console.error("Güncelleme hatası:",s),A("❌ Güncelleme başarısız: "+s.message,"error"),e&&e.remove()}};function A(a,t="success"){const e=document.createElement("div");e.style.cssText=`
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
