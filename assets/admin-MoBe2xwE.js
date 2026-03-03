import{s as h}from"./supabase-client-DJwy2zW3.js";import"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";let v="month",w=null,E=null,k=null;async function N(){let e,a=null;const t=new Date;if(v==="day"&&k)e=k,a=k;else if(v==="custom"&&w&&E)e=w,a=E;else switch(v){case"week":const l=new Date;l.setDate(l.getDate()-7),e=l.toISOString().split("T")[0];break;case"month":e=new Date(t.getFullYear(),t.getMonth(),1).toISOString().split("T")[0];break;case"lastmonth":e=new Date(t.getFullYear(),t.getMonth()-1,1).toISOString().split("T")[0],a=new Date(t.getFullYear(),t.getMonth(),0).toISOString().split("T")[0];break;case"all":e="2020-01-01";break;default:e=new Date(t.getFullYear(),t.getMonth(),1).toISOString().split("T")[0]}let i=h.from("daily_reports").select("*, cashiers(name)").gte("date",e).order("date",{ascending:!1});a&&(i=i.lte("date",a));const[s,n]=await Promise.all([i,h.from("cashiers").select("*").order("total_points",{ascending:!1})]);return{weekly:[],reports:s.data||[],cashiers:n.data||[]}}function Z(e){const a={};return e.forEach(t=>{const i=`${t.date}-${t.kasa}`;(!a[i]||t.shift==="aksam")&&(a[i]=t)}),Object.values(a).reduce((t,i)=>(t.restoran+=parseFloat(i.rumeli_z2||0),t.cafetarya+=parseFloat(i.rumeli_z1||0),t.balik+=parseFloat(i.balik_ekmek||0),t.dondurma+=parseFloat(i.dondurma||0),t.total+=parseFloat(i.rumeli_z2||0)+parseFloat(i.rumeli_z1||0)+parseFloat(i.balik_ekmek||0)+parseFloat(i.dondurma||0),t),{restoran:0,cafetarya:0,balik:0,dondurma:0,total:0})}function R(e){const a={};e.forEach(s=>{const n=`${s.date}-${s.kasa}`;(!a[n]||s.shift==="aksam")&&(a[n]=s)});const t={};Object.values(a).forEach(s=>{const n=s.date;t[n]||(t[n]=0),t[n]+=parseFloat(s.rumeli_z2||0)+parseFloat(s.rumeli_z1||0)+parseFloat(s.balik_ekmek||0)+parseFloat(s.dondurma||0)});const i=Object.keys(t).sort();return{labels:i.map(s=>G(s)),data:i.map(s=>t[s])}}function W(e){const a={};e.forEach(i=>{const s=`${i.date}-${i.kasa}`;(!a[s]||i.shift==="aksam")&&(a[s]=i)});const t={sabah:0,aksam:0};return Object.values(a).forEach(i=>{const s=parseFloat(i.rumeli_z2||0)+parseFloat(i.rumeli_z1||0)+parseFloat(i.balik_ekmek||0)+parseFloat(i.dondurma||0);i.shift==="sabah"?t.sabah+=s:i.shift==="aksam"&&(t.aksam+=s)}),t}function U(e,a){const t={};return e.forEach(i=>{var n;const s=((n=i.cashiers)==null?void 0:n.name)||"Bilinmiyor";t[s]||(t[s]=0),t[s]+=parseFloat(i.individual_revenue||0)}),t}function Q(e,a){const t=new Date().toISOString().split("T")[0],i=e.filter(d=>d.date===t),s=[...new Set(i.map(d=>d.cashier_id))],n=a.filter(d=>!s.includes(d.id)),l=e.filter(d=>!d.is_on_time),g=R(e),r=Math.max(...g.data,0);return{notEntered:n,lateEntries:l,maxCiro:r}}function X(e){const a=R(e),t=Math.max(...a.data,0),i=new Date().toISOString().split("T")[0],s=e.filter(d=>d.date===i),l=[...new Set(s.map(d=>d.cashier_id))].length;return{maxDailyCiro:t,activeCashiers:l,avgEntryTime:"2.5dk",weeklyGrowth:"+12%"}}function J(){const e=new Date,a=e.getDay(),t=["2026-01-01","2026-04-23","2026-05-01","2026-05-19","2026-08-30","2026-10-29"],i=e.toISOString().split("T")[0];return t.includes(i)?"special":a===0||a===6?"weekend":"weekday"}async function aa(){try{const e=J();console.log("Hedef tipi:",e);const{data:a,error:t}=await h.from("targets").select("amount").eq("target_type",e).single();return t?(console.error("Hedef çekme hatası:",t),{weekday:15e4,weekend:2e5,special:25e4}[e]):(console.log("Çekilen hedef:",a.amount),parseFloat(a.amount)||15e4)}catch(e){return console.error("fetchDailyTarget hatası:",e),15e4}}function ea(){typeof anime>"u"||(anime({targets:".kasa-card, .sc, .total-hero-card",opacity:[0,1],translateY:[40,0],delay:anime.stagger(100),duration:800,easing:"easeOutCubic"}),anime({targets:".rank-card",opacity:[0,1],translateX:[-40,0],delay:anime.stagger(120),duration:700,easing:"easeOutCubic"}))}function ta(){if(typeof anime>"u")return;const e=document.getElementById("totalDailyCiro"),a=parseFloat(e.getAttribute("data-value")||0);anime({targets:{value:0},value:a,duration:2e3,easing:"easeOutExpo",update:function(s){e.textContent=m(s.animations[0].currentValue)}});const t=document.getElementById("progressBarFill"),i=parseFloat(t.getAttribute("data-percent")||0);anime({targets:"#progressBarFill",width:i+"%",duration:1500,easing:"easeInOutQuad"})}function ia(e){const a={gida:{name:"Gıda",icon:"🥗",total:0,color:"#22c55e"},kahvalti:{name:"Kahvaltı",icon:"🥐",total:0,color:"#f59e0b"},kahve:{name:"Kahve",icon:"☕",total:0,color:"#8b5cf6"},meyvesuyu:{name:"Meyve Suyu",icon:"🧃",total:0,color:"#ec4899"},sicak_icecek:{name:"Sıcak İçecek",icon:"🔥",total:0,color:"#ef4444"},soguk_icecek:{name:"Soğuk İçecek",icon:"🥤",total:0,color:"#3b82f6"},tatli:{name:"Tatlı",icon:"🍰",total:0,color:"#a855f7"}},t={};e.forEach(n=>{const l=`${n.date}-${n.kasa}`;(!t[l]||n.shift==="aksam")&&(t[l]=n)}),Object.values(t).forEach(n=>{a.gida.total+=parseFloat(n.gida)||0,a.kahvalti.total+=parseFloat(n.kahvalti)||0,a.kahve.total+=parseFloat(n.kahve)||0,a.meyvesuyu.total+=parseFloat(n.meyvesuyu)||0,a.sicak_icecek.total+=parseFloat(n.sicak_icecek)||0,a.soguk_icecek.total+=parseFloat(n.soguk_icecek)||0,a.tatli.total+=parseFloat(n.tatli)||0});const i=Object.values(a).reduce((n,l)=>n+l.total,0);Object.values(a).forEach(n=>{n.percentage=i>0?n.total/i*100:0});const s=Object.entries(a).map(([n,l])=>({key:n,...l})).sort((n,l)=>l.total-n.total);return{categories:s,total:i,highest:s[0],lowest:s[s.length-1],average:i/s.length}}function sa(e){return e.categories.map(a=>`
                <div class="category-card">
                    <div class="category-header">
                        <span class="category-icon">${a.icon}</span>
                        <span class="category-name">${a.name}</span>
                    </div>
                    <div class="category-amount">${m(a.total)}</div>
                    <div class="category-stats">
                        <span class="category-percentage">${a.percentage.toFixed(1)}% pay</span>
                    </div>
                </div>
            `).join("")}function na(e){var t;const a=((t=e.categories[0])==null?void 0:t.total)||1;return e.categories.map(i=>{const s=a>0?i.total/a*100:0;return`
                    <div class="category-bar">
                        <div class="category-bar-label">${i.icon} ${i.name}</div>
                        <div class="category-bar-track">
                            <div class="category-bar-fill" style="width:${s}%;background:${i.color};">
                                ${u(i.total)}
                            </div>
                        </div>
                    </div>
                `}).join("")}function oa(e){return`
                <div class="category-summary-card">
                    <div class="summary-icon">🏆</div>
                    <div class="summary-label">En Çok Satan</div>
                    <div class="summary-value">${e.highest.icon} ${e.highest.name}</div>
                    <div style="font-size:12px;color:var(--acc);margin-top:4px;font-weight:600;">${u(e.highest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📉</div>
                    <div class="summary-label">En Az Satan</div>
                    <div class="summary-value">${e.lowest.icon} ${e.lowest.name}</div>
                    <div style="font-size:12px;color:var(--txt3);margin-top:4px;font-weight:600;">${u(e.lowest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📊</div>
                    <div class="summary-label">Kategori Ort.</div>
                    <div class="summary-value">${u(e.average)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">Kategori başına</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">💰</div>
                    <div class="summary-label">Kategori Toplamı</div>
                    <div class="summary-value">${u(e.total)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">7 kategori</div>
                </div>
            `}async function la(e,a,t){const i=await aa(),s=Z(a),n=R(a),l=W(a),g=U(a),r=Q(a,t),d=X(a),y=ia(a),f={};a.forEach(o=>{var C;const c=o.cashier_id,_=((C=o.cashiers)==null?void 0:C.name)||"Bilinmiyor";f[c]||(f[c]={name:_,points:0,entries:0,revenue:0}),f[c].points+=parseInt(o.points_earned)||0,f[c].entries+=1,f[c].revenue+=parseFloat(o.individual_revenue)||0});const $=Object.values(f).sort((o,c)=>c.points-o.points),b=$.length>0?$[0]:null,x=a.length,S=a.filter(o=>o.is_on_time).length,P=x>0?Math.round(S/x*100):0,B=[...new Set(a.map(o=>o.date))].length,Y=B>0?s.total/B:0,H=s.total,j=v==="day"&&k?k:new Date().toISOString().split("T")[0],I={};a.filter(o=>o.date===j).forEach(o=>{const c=`${o.date}-${o.kasa}`;(!I[c]||o.shift==="aksam")&&(I[c]=o)});const A=Object.values(I).reduce((o,c)=>o+parseFloat(c.total_revenue||0),0),D=i>0?Math.min(100,Math.round(A/i*100)):0;document.getElementById("mainContent").innerHTML=`
            <!-- HERO -->
            <div id="heroSection" class="hero ${b&&b.points>0?"gold":"blue"}">
                <div class="hero-badge">🏆 AYIN ELEMANI</div>
                <div class="hero-name">${b?b.name:"Henüz Veri Yok"}</div>
                <div class="hero-amt">${b?b.points:0} Puan</div>
                <div class="hero-sub">
                    ${b?`${b.entries} giriş · ${m(b.revenue)}`:"İlk veriyi girin!"}
                </div>
            </div>

            <!-- GÜNLÜK TOPLAM HERO KARTI -->
            <div class="section-title">💰 Rumeli İskelesi Toplam Ciro</div>
            <div class="total-hero-card">
                <div class="total-hero-left">
                    <div class="total-hero-label">Günlük Toplam Ciro</div>
                    <div class="total-hero-amount" id="totalDailyCiro" data-value="${H}">0,00 ₺</div>
                    <div class="total-hero-breakdown">
                        <span class="breakdown-item">🍽️ <span id="breakdownRestoran">${u(s.restoran)}</span></span>
                        <span class="breakdown-item">☕ <span id="breakdownCafetarya">${u(s.cafetarya)}</span></span>
                        <span class="breakdown-item">🐟 <span id="breakdownBalik">${u(s.balik)}</span></span>
                        <span class="breakdown-item">🍦 <span id="breakdownDondurma">${u(s.dondurma)}</span></span>
                    </div>
                </div>
                <div class="total-hero-right">
                    <div class="target-section">
                        <div class="target-label">📊 Günlük Hedef</div>
                        <div class="target-amount" id="targetAmount">${m(i)}</div>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" id="progressBarFill" style="width:0%" data-percent="${D}"></div>
                        </div>
                        <div class="progress-percent" id="progressPercent">${D}% Tamamlandı</div>
                    </div>
                </div>
            </div>

            <!-- GÜNLÜK HEDEF GÖSTERGESİ -->
            <div class="daily-target-card">
                <div class="target-header">
                    <div class="target-title">🎯 Bugünkü Hedef</div>
                    <div class="target-date">${new Date().toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"})}</div>
                </div>
                <div class="target-body">
                    <div class="target-amount-section">
                        <div class="target-label">Hedef</div>
                        <div class="target-amount">${m(i)}</div>
                    </div>
                    <div class="target-current-section">
                        <div class="target-label">Gerçekleşen</div>
                        <div class="target-current">${m(A)}</div>
                    </div>
                </div>
                <div class="target-progress-section">
                    <div class="progress-header">
                        <span class="progress-label">İlerleme</span>
                        <span class="progress-percent">${D}%</span>
                    </div>
                    <div class="progress-bar-wrapper">
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill" id="dailyProgressBar" data-percent="${D}" style="width:0%"></div>
                        </div>
                    </div>
                    <div class="progress-status">
                        ${D>=100?"🎉 Hedef Tamamlandı!":D>=80?"💪 Hedefe Yakın!":D>=50?"⏰ Yarı Yolda!":"🚀 Devam Edelim!"}
                    </div>
                </div>
            </div>

            <!-- TARİH FİLTRESİ -->
            <div class="date-filter-section">
                <div class="filter-label">📅 Tarih Aralığı:</div>
                <div class="filter-buttons">
                    <button class="filter-btn ${v==="month"?"active":""}" data-range="month" onclick="setDateFilter('month')">
                        Bu Ay
                    </button>
                    <button class="filter-btn ${v==="lastmonth"?"active":""}" data-range="lastmonth" onclick="setDateFilter('lastmonth')">
                        Geçen Ay
                    </button>
                    <button class="filter-btn ${v==="week"?"active":""}" data-range="week" onclick="setDateFilter('week')">
                        Bu Hafta
                    </button>
                    <button class="filter-btn ${v==="all"?"active":""}" data-range="all" onclick="setDateFilter('all')">
                        Tümü
                    </button>
                    <button class="filter-btn ${v==="day"?"active":""}" data-range="day" onclick="showDayPicker()">
                        📅 Belirli Gün
                    </button>
                    <button class="filter-btn ${v==="custom"?"active":""}" data-range="custom" onclick="showCustomDatePicker()">
                        Özel Aralık ▼
                    </button>
                </div>
                <div class="filter-info" id="filterInfo">
                    ${v==="week"?"Son 7 gün":v==="month"?`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`:v==="lastmonth"?`Geçen Ay (${new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`:v==="all"?"Tüm veriler":v==="day"&&k?new Date(k).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}):w?`${new Date(w).toLocaleDateString("tr-TR")} - ${new Date(E).toLocaleDateString("tr-TR")}`:`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`}
                </div>
            </div>

            <!-- KASİYER SIRALAMALARI -->
            <div class="section-title">👥 Kasiyer Sıralaması <span style="font-size:13px;font-weight:500;color:var(--txt2);">(Bu Ay)</span></div>
            <div id="rankGrid" class="rank-grid">
                ${$.map((o,c)=>{const _=t.find(V=>(V.name||"")===o.name)||{},C=_.id||"",q=M(_.badge_level);return`
                    <div class="rank-card">
                        <div class="rank-pos p${Math.min(c+1,4)}">#${c+1}</div>
                        <div class="rank-avatar av-${ma(o.name)}">${va(o.name)}</div>
                        <div class="rank-info">
                            <div class="rank-name">${o.name}</div>
                            <div class="rank-meta">
                                ${o.entries} giriş · ${u(o.revenue)} ciro
                            </div>
                        </div>
                        <div class="rank-right">
                            <div class="rank-pts">${o.points} puan</div>
                            <div class="rank-badge-pill">${q}</div>
                            ${C?`<button class="badge-assign-btn" onclick="assignBadge('${C}','${o.name}')">🎖️ Rozet Ver</button>`:""}
                        </div>
                    </div>`}).join("")}
            </div>

            <!-- KASA BAZLI CİROLAR -->
            <div class="section-title">🏪 Kasa Bazlı Cirolar</div>
            <div class="kasa-grid">
                <div class="kasa-card restoran">
                    <div class="kasa-icon">🍽️</div>
                    <div class="kasa-label">Restoran</div>
                    <div class="kasa-amount">${m(s.restoran)}</div>
                    <div class="kasa-sub">Rumeli Z2</div>
                    <div class="kasa-percent up">%${s.total>1?Math.round(s.restoran/s.total*100):0} toplam</div>
                </div>
                <div class="kasa-card cafetarya">
                    <div class="kasa-icon">☕</div>
                    <div class="kasa-label">Cafetarya</div>
                    <div class="kasa-amount">${m(s.cafetarya)}</div>
                    <div class="kasa-sub">Rumeli Z1</div>
                    <div class="kasa-percent up">%${s.total>1?Math.round(s.cafetarya/s.total*100):0} toplam</div>
                </div>
                <div class="kasa-card balik">
                    <div class="kasa-icon">🐟</div>
                    <div class="kasa-label">Balık Ekmek</div>
                    <div class="kasa-amount">${m(s.balik)}</div>
                    <div class="kasa-sub">Z Raporu</div>
                    <div class="kasa-percent up">%${s.total>1?Math.round(s.balik/s.total*100):0} toplam</div>
                </div>
                <div class="kasa-card dondurma">
                    <div class="kasa-icon">🍦</div>
                    <div class="kasa-label">Dondurma</div>
                    <div class="kasa-amount">${m(s.dondurma)}</div>
                    <div class="kasa-sub">Z Raporu</div>
                    <div class="kasa-percent up">%${s.total>1?Math.round(s.dondurma/s.total*100):0} toplam</div>
                </div>
            </div>

            <!-- ÖZET İSTATİSTİKLER -->
            <div class="section-title">📊 Özet İstatistikler</div>
            <div class="summary-grid">
                <div class="sc blue">
                    <div class="sc-l">Bu Hafta Toplam Ciro</div>
                    <div class="sc-v">${u(s.total)}</div>
                    <div class="sc-s">${B} günlük veri</div>
                </div>
                <div class="sc purple">
                    <div class="sc-l">Günlük Ortalama</div>
                    <div class="sc-v">${u(Y)}</div>
                    <div class="sc-s">Son ${B} gün</div>
                </div>
                <div class="sc orange">
                    <div class="sc-l">Zamanında Giriş</div>
                    <div class="sc-v">%${P}</div>
                    <div class="sc-s">${S}/${x} giriş</div>
                </div>
                <div class="sc green">
                    <div class="sc-l">Toplam Giriş Sayısı</div>
                    <div class="sc-v">${x}</div>
                    <div class="sc-s">Son 7 gün</div>
                </div>

                <!-- YENİ KARTLAR -->
                <div class="sc cyan">
                    <div class="sc-l">Ortalama İşlem Süresi</div>
                    <div class="sc-v" id="avgEntryTime">${d.avgEntryTime}</div>
                    <div class="sc-s">Son 7 günlük ortalama</div>
                </div>

                <div class="sc pink">
                    <div class="sc-l">En Yüksek Günlük Ciro</div>
                    <div class="sc-v" id="maxDailyCiro">${u(d.maxDailyCiro)}</div>
                    <div class="sc-s">Bu hafta rekor</div>
                </div>

                <div class="sc indigo">
                    <div class="sc-l">Aktif Kasiyer</div>
                    <div class="sc-v" id="activeCashiers">${d.activeCashiers}/${t.length}</div>
                    <div class="sc-s">Bugün giriş yapan</div>
                </div>

                <div class="sc emerald">
                    <div class="sc-l">Haftalık Büyüme</div>
                    <div class="sc-v" id="weeklyGrowth">${d.weeklyGrowth}</div>
                    <div class="sc-s">Önceki haftaya göre</div>
                </div>
            </div>

            <!-- KATEGORİ SATIŞ ANALİZİ -->
            <div class="section-title">🏷️ Kategori Bazlı Satış Analizi</div>

            <!-- Kategori Kartları -->
            <div class="category-cards-grid">
                ${sa(y)}
            </div>

            <!-- Kategori Grafikler + Özet -->
            <div class="category-charts">
                <div class="category-chart-box">
                    <div class="chart-title">📊 Kategori Karşılaştırması</div>
                    ${na(y)}
                </div>
                <div class="category-chart-box">
                    <div class="chart-title">📋 Özet İstatistikler</div>
                    <div class="category-summary">
                        ${oa(y)}
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
                <div class="alert-card ${r.notEntered.length>0?"danger":"ok"}">
                    <div class="alert-title">
                        ${r.notEntered.length>0?"❌":"✅"} Bugün Giriş Yapmayanlar
                    </div>
                    ${r.notEntered.length===0?'<div class="alert-item">Tüm kasiyerler giriş yaptı!</div>':r.notEntered.map(o=>`
                            <div class="alert-item">
                                <span>${o.name}</span>
                                <span style="color:var(--red)">Giriş Yok</span>
                            </div>
                        `).join("")}
                </div>
                <div class="alert-card ${r.lateEntries.length>0?"warning":"ok"}">
                    <div class="alert-title">⚠️ Geç Girişler (Bu Hafta)</div>
                    ${r.lateEntries.length===0?'<div class="alert-item">Bu hafta geç giriş yok! 🎉</div>':r.lateEntries.slice(0,5).map(o=>{var c;return`
                            <div class="alert-item">
                                <span>${((c=o.cashiers)==null?void 0:c.name)||"Bilinmiyor"}</span>
                                <span style="color:var(--orange)">${K(o.entry_time)}</span>
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
                        <span style="color:var(--orange)">${e.reduce((o,c)=>o+(c.weekly_points||0),0)}</span>
                    </div>
                    <div class="alert-item">
                        <span>Aktif Kasiyer</span>
                        <span style="color:var(--green)">${e.filter(o=>(o.total_entries||0)>0).length}/${t.length}</span>
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
                        <div style="font-size:13px;color:var(--txt2);">${a.length} kayıt</div>
                    </div>
                    <div class="filter-controls">
                        <input type="date" id="filterDate" class="finput">
                        <select id="filterKasiyer" class="fsel">
                            <option value="">Tüm Kasiyerler</option>
                            ${t.map(o=>`<option value="${o.id}">${o.name}</option>`).join("")}
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
                                ${F(a)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `,ra(n,s,l,g);const L=document.getElementById("applyFiltersBtn"),O=document.getElementById("clearFiltersBtn");L&&L.addEventListener("click",da),O&&O.addEventListener("click",ca),document.getElementById("lastUpdate").textContent="Son güncelleme: "+new Date().toLocaleTimeString("tr-TR"),setTimeout(()=>{ea(),ta()},100),setTimeout(()=>{const o=document.getElementById("dailyProgressBar");o&&(o.style.width=Math.min(100,parseFloat(o.dataset.percent))+"%")},200)}let p={};function ra(e,a,t,i){Chart.defaults.color="#7a8ba8",Chart.defaults.borderColor="#1e3a5f",Chart.defaults.font.family="DM Sans";const s=document.getElementById("dailyChart");s&&(p.daily&&p.daily.destroy(),p.daily=new Chart(s,{type:"bar",data:{labels:e.labels.length>0?e.labels:["Veri Yok"],datasets:[{label:"Günlük Ciro (₺)",data:e.data.length>0?e.data:[0],backgroundColor:"rgba(59,130,246,.7)",borderColor:"#3b82f6",borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:r=>"₺"+new Intl.NumberFormat("tr-TR").format(r)}}}}}));const n=document.getElementById("kasaChart");if(n){p.kasa&&p.kasa.destroy();const r=a.total>0,d=r?[a.restoran,a.cafetarya,a.balik,a.dondurma]:[.001,.001,.001,.001];p.kasa=new Chart(n,{type:"doughnut",data:{labels:["Restoran","Cafetarya","Balık Ekmek","Dondurma"],datasets:[{data:d,backgroundColor:["rgba(59,130,246,.8)","rgba(139,92,246,.8)","rgba(6,182,212,.8)","rgba(236,72,153,.8)"],borderColor:"#111d32",borderWidth:3,hoverOffset:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{position:"bottom",labels:{padding:16,usePointStyle:!0}},tooltip:{enabled:r,callbacks:{label:y=>{const f=y.raw,$=y.dataset.data.reduce((x,S)=>x+S,0),b=Math.round(f/$*100);return` ${y.label}: ${m(f)} (%${b})`}}}},cutout:"65%"}})}const l=document.getElementById("shiftChart");l&&(p.shift&&p.shift.destroy(),p.shift=new Chart(l,{type:"bar",data:{labels:["Sabah Vardiyası","Akşam Vardiyası"],datasets:[{label:"Ciro (₺)",data:[t.sabah||0,t.aksam||0],backgroundColor:["rgba(245,158,11,.7)","rgba(139,92,246,.7)"],borderColor:["#f59e0b","#8b5cf6"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:r=>"₺"+new Intl.NumberFormat("tr-TR").format(r)}}}}}));const g=document.getElementById("cashierChart");if(g){p.cashier&&p.cashier.destroy();const r=Object.keys(i),d=Object.values(i);p.cashier=new Chart(g,{type:"bar",data:{labels:r.length>0?r:["Veri Yok"],datasets:[{label:"Ciro (₺)",data:d.length>0?d:[0],backgroundColor:["rgba(139,92,246,.7)","rgba(245,158,11,.7)","rgba(236,72,153,.7)","rgba(34,197,94,.7)"],borderColor:["#8b5cf6","#f59e0b","#ec4899","#22c55e"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:y=>"₺"+new Intl.NumberFormat("tr-TR").format(y)}}}}})}}let z=[];function F(e){return e.length===0?'<tr><td colspan="9" style="text-align:center;color:var(--txt2);padding:40px;">Henüz veri yok</td></tr>':e.map(a=>{var s;const t=parseFloat(a.total_revenue||0),i=parseFloat(a.individual_revenue||t);return`
                <tr>
                    <td>${G(a.date)}</td>
                    <td style="font-weight:600">${((s=a.cashiers)==null?void 0:s.name)||"-"}</td>
                    <td><span class="badge ${a.kasa||""}">${a.kasa==="restoran"?"🍽️ Restoran":a.kasa==="cafetarya"?"☕ Cafetarya":"-"}</span></td>
                    <td><span class="badge ${a.shift||""}">${a.shift==="sabah"?"🌅 Sabah":a.shift==="aksam"?"🌙 Akşam":"-"}</span></td>
                    <td class="mono">${K(a.entry_time)}</td>
                    <td class="r">
                        <div class="mono" style="font-weight:700;color:var(--txt);">${m(i)}</div>
                        ${a.shift==="aksam"&&t!==i?`<div style="font-size:11px;color:var(--txt3);">EOD Toplam: ${m(t)}</div>`:""}
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
            `}).join("")}function da(){const e=document.getElementById("filterDate").value,a=document.getElementById("filterKasiyer").value,t=document.getElementById("filterKasa").value,i=document.getElementById("filterVardiya").value;let s=[...z];e&&(s=s.filter(n=>n.date===e)),a&&(s=s.filter(n=>n.cashier_id===a)),t&&(s=s.filter(n=>n.kasa===t)),i&&(s=s.filter(n=>n.shift===i)),document.getElementById("entriesBody").innerHTML=F(s)}function ca(){document.getElementById("filterDate").value="",document.getElementById("filterKasiyer").value="",document.getElementById("filterKasa").value="",document.getElementById("filterVardiya").value="",document.getElementById("entriesBody").innerHTML=F(z)}function m(e){return new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(e||0)+" ₺"}function u(e){return e>=1e6?(e/1e6).toFixed(1)+"M ₺":e>=1e3?(e/1e3).toFixed(1)+"K ₺":m(e)}function G(e){return e?new Date(e).toLocaleDateString("tr-TR",{day:"2-digit",month:"2-digit"}):"-"}function K(e){return e?new Date(e).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"}):"-"}function va(e){return e?e.split(" ").map(a=>a[0]).join(""):"??"}function ma(e){if(!e)return"t";const a=e.split(" ")[0];return{Tuba:"t",Elif:"e",Melda:"m",Ceren:"c"}[a]||"t"}function M(e){return{yeni:"🌱 Yeni",bronz:"🥉 Bronz",gumus:"🥈 Gümüş",altin:"🥇 Altın",elmas:"💎 Elmas",efsane:"👑 Efsane",efsane_plus:"👑⭐ Süper Efsane",ozel_yildiz:"🌟 Yılın Yıldızı",ozel_ates:"🔥 Ateş Çıkışlı",ozel_roket:"🚀 Hızlı Yükseliş",ozel_onur:"🏅 Onur Madalyası",ozel_takim:"🤝 Takım Ruhu"}[e]||"🌱 Yeni"}window.assignBadge=async function(e,a){const t=[{key:"ozel_yildiz",icon:"🌟",name:"Yılın Yıldızı",desc:"En parlak performans"},{key:"ozel_ates",icon:"🔥",name:"Ateş Çıkışlı",desc:"Haftanın en iyisi"},{key:"ozel_roket",icon:"🚀",name:"Hızlı Yükseliş",desc:"En hızlı gelişim"},{key:"ozel_onur",icon:"🏅",name:"Onur Madalyası",desc:"Olağanüstü hizmet"},{key:"ozel_takim",icon:"🤝",name:"Takım Ruhu",desc:"Ekip çalışması"}],i=document.createElement("div");i.className="badge-modal-overlay",i.innerHTML=`
                <div class="badge-modal-box">
                    <div class="badge-modal-header">
                        <h3>🎖️ ${a} — Rozet Ver</h3>
                        <button onclick="this.closest('.badge-modal-overlay').remove()" class="close-btn" style="background:none;border:none;font-size:20px;color:var(--txt2);cursor:pointer;">✕</button>
                    </div>
                    <div class="badge-option-grid">
                        ${t.map(s=>`
                            <div class="badge-option" data-key="${s.key}" onclick="selectBadgeOption(this,'${s.key}')">
                                <div class="badge-icon">${s.icon}</div>
                                <div class="badge-name">${s.name}</div>
                                <div class="badge-desc">${s.desc}</div>
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
                </div>`,document.body.appendChild(i)};window.selectBadgeOption=function(e,a){document.querySelectorAll(".badge-option").forEach(t=>t.classList.remove("selected")),e.classList.add("selected"),e.closest(".badge-modal-overlay").__selectedBadge=a};window.saveBadgeAssignment=async function(e){const a=document.querySelector(".badge-modal-overlay"),t=a==null?void 0:a.__selectedBadge;if(!t){alert("Lütfen bir rozet seçin.");return}try{let i=t;if(t==="auto"){const{data:n}=await h.from("cashiers").select("total_points").eq("id",e).single(),l=(n==null?void 0:n.total_points)||0;l>=600?i="efsane_plus":l>=400?i="efsane":l>=250?i="elmas":l>=150?i="altin":l>=75?i="gumus":l>=30?i="bronz":i="yeni"}const{error:s}=await h.from("cashiers").update({badge_level:i}).eq("id",e);if(s)throw s;a.remove(),T(`✅ Rozet atandı: ${M(i)}`,"success"),await loadDashboard()}catch(i){console.error("Rozet atama hatası:",i),alert("❌ Hata: "+i.message)}};window.toggleDetails=function(){const e=document.getElementById("detailedSection"),a=document.getElementById("toggleIcon"),t=document.getElementById("toggleText");e&&(e.style.display==="none"?(e.style.display="block",a.textContent="🙈",t.textContent="Detaylı Verileri Gizle"):(e.style.display="none",a.textContent="👁️",t.textContent="Detaylı Verileri Göster"))};window.setDateFilter=function(e){v=e,w=null,E=null,document.querySelectorAll(".filter-btn").forEach(r=>r.classList.remove("active"));const a=document.querySelector(`[data-range="${e}"]`);a&&a.classList.add("active");const t=new Date,i=t.toLocaleDateString("tr-TR",{month:"long",year:"numeric"}),n=new Date(t.getFullYear(),t.getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"}),l={week:"Son 7 gün",month:`Bu Ay (${i})`,lastmonth:`Geçen Ay (${n})`,all:"Tüm veriler"},g=document.getElementById("filterInfo");g&&(g.textContent=l[e]||""),window.loadDashboard()};window.showDayPicker=function(){const e=document.createElement("div");e.className="custom-date-modal",e.style.display="flex",e.id="dayPickerModal",e.innerHTML=`
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
            `,document.body.appendChild(e),document.getElementById("singleDayPicker").value=k||new Date().toISOString().split("T")[0]};window.applyDayFilter=function(){const e=document.getElementById("singleDayPicker"),a=e==null?void 0:e.value;if(!a){alert("⚠️ Lütfen bir tarih seçin!");return}k=a,v="day",w=null,E=null,document.querySelectorAll(".filter-btn").forEach(l=>l.classList.remove("active"));const t=document.querySelector('[data-range="day"]');t&&t.classList.add("active");const i=new Date(a).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}),s=document.getElementById("filterInfo");s&&(s.textContent=i);const n=document.getElementById("dayPickerModal");n&&n.remove(),window.loadDashboard()};window.showCustomDatePicker=function(){const e=document.getElementById("customDateModal"),a=new Date().toISOString().split("T")[0];if(document.getElementById("customStartDate").max=a,document.getElementById("customEndDate").max=a,w)document.getElementById("customStartDate").value=w;else{const t=new Date;t.setDate(t.getDate()-7),document.getElementById("customStartDate").value=t.toISOString().split("T")[0]}document.getElementById("customEndDate").value=E||a,e.style.display="flex"};window.closeCustomDatePicker=function(){document.getElementById("customDateModal").style.display="none"};window.applyCustomDateRange=function(){const e=document.getElementById("customStartDate").value,a=document.getElementById("customEndDate").value;if(!e||!a){alert("⚠️ Lütfen başlangıç ve bitiş tarihlerini seçin!");return}if(e>a){alert("⚠️ Başlangıç tarihi bitiş tarihinden sonra olamaz!");return}w=e,E=a,v="custom",document.querySelectorAll(".filter-btn").forEach(l=>l.classList.remove("active"));const t=document.querySelector('[data-range="custom"]');t&&t.classList.add("active");const i=new Date(e).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),s=new Date(a).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),n=document.getElementById("filterInfo");n&&(n.textContent=`${i} - ${s}`),window.closeCustomDatePicker(),window.loadDashboard()};window.loadDashboard=async function(){try{document.getElementById("mainContent").innerHTML=`
                    <div class="loading">
                        <div class="spinner"></div>
                        <div>Veriler yükleniyor...</div>
                    </div>
                `;const{weekly:e,reports:a,cashiers:t}=await N();z=a,await la(e,a,t)}catch(e){console.error("Dashboard yükleme hatası:",e),document.getElementById("mainContent").innerHTML=`
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
            `,document.body.appendChild(a)};window.confirmDelete=async function(e){const a=document.querySelector(".modal-overlay");try{console.log("Siliniyor:",e);const{data:t,error:i}=await h.from("daily_reports").delete().eq("id",e);if(console.log("Delete response:",{data:t,error:i}),i)throw new Error(i.message);a&&a.remove(),T("✅ Kayıt başarıyla silindi!","success"),await loadDashboard()}catch(t){console.error("Silme hatası:",t),T("❌ Silme başarısız: "+t.message,"error"),a&&a.remove()}};window.editEntry=async function(e){console.log("editEntry çağrıldı:",e);const{data:a,error:t}=await h.from("daily_reports").select("*").eq("id",e).single();if(t){T("❌ Kayıt bulunamadı","error");return}const i=document.createElement("div");i.className="modal-overlay",i.innerHTML=`
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
            `,document.body.appendChild(i)};window.confirmEdit=async function(e){const a=document.querySelector(".modal-overlay");try{const t=parseFloat(document.getElementById("editZCiro").value)||0,i=parseInt(document.getElementById("editPuan").value)||0,s=document.getElementById("editDurum").value==="true";console.log("Güncelleniyor:",{entryId:e,newZCiro:t,newPuan:i,newDurum:s});const{error:n}=await h.from("daily_reports").update({total_revenue:t,points_earned:i,is_on_time:s}).eq("id",e);if(n)throw n;const{data:l}=await h.from("daily_reports").select("cashier_id").eq("id",e).single();if(!l)throw new Error("Kayıt bulunamadı");const{data:g}=await h.from("daily_reports").select("points_earned").eq("cashier_id",l.cashier_id),r=g.reduce((f,$)=>f+(parseInt($.points_earned)||0),0);console.log("Toplam puan:",r);let d="yeni";r>=1e3?d="efsane":r>=500?d="elmas":r>=300?d="altin":r>=150?d="gumus":r>=50&&(d="bronz");const{error:y}=await h.from("cashiers").update({total_points:r,badge_level:d}).eq("id",l.cashier_id);if(y)throw y;a&&a.remove(),T("✅ Kayıt ve kasiyer puanı güncellendi!","success"),await loadDashboard()}catch(t){console.error("Güncelleme hatası:",t),T("❌ Güncelleme başarısız: "+t.message,"error"),a&&a.remove()}};function T(e,a="success"){const t=document.createElement("div");t.style.cssText=`
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
