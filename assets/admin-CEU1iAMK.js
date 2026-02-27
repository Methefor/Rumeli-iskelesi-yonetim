import{s as b}from"./supabase-client-Ct8-IVBM.js";import"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";let c="month",k=null,E=null,h=null;async function G(){let t,a=null;if(c==="day"&&h)t=h,a=h;else if(c==="custom"&&k&&E)t=k,a=E;else switch(c){case"week":const r=new Date;r.setDate(r.getDate()-7),t=r.toISOString().split("T")[0];break;case"month":const u=new Date;u.setDate(u.getDate()-30),t=u.toISOString().split("T")[0];break;case"all":t="2020-01-01";break;default:const n=new Date;n.setDate(n.getDate()-7),t=n.toISOString().split("T")[0]}let e=b.from("daily_reports").select("*, cashiers(name)").gte("date",t).order("date",{ascending:!1});a&&(e=e.lte("date",a));const[s,i,l]=await Promise.all([b.from("weekly_performance").select("*").order("weekly_points",{ascending:!1}),e,b.from("cashiers").select("*").order("total_points",{ascending:!1})]);return{weekly:s.data||[],reports:i.data||[],cashiers:l.data||[]}}function O(t){const a={};return t.forEach(e=>{const s=`${e.date}-${e.kasa}`;(!a[s]||e.shift==="aksam")&&(a[s]=e)}),Object.values(a).reduce((e,s)=>(e.restoran+=parseFloat(s.rumeli_z2||0),e.cafetarya+=parseFloat(s.rumeli_z1||0),e.balik+=parseFloat(s.balik_ekmek||0),e.dondurma+=parseFloat(s.dondurma||0),e.total+=parseFloat(s.rumeli_z2||0)+parseFloat(s.rumeli_z1||0)+parseFloat(s.balik_ekmek||0)+parseFloat(s.dondurma||0),e),{restoran:0,cafetarya:0,balik:0,dondurma:0,total:0})}function B(t){const a={};t.forEach(i=>{const l=`${i.date}-${i.kasa}`;(!a[l]||i.shift==="aksam")&&(a[l]=i)});const e={};Object.values(a).forEach(i=>{const l=i.date;e[l]||(e[l]=0),e[l]+=parseFloat(i.rumeli_z2||0)+parseFloat(i.rumeli_z1||0)+parseFloat(i.balik_ekmek||0)+parseFloat(i.dondurma||0)});const s=Object.keys(e).sort();return{labels:s.map(i=>F(i)),data:s.map(i=>e[i])}}function M(t){const a={};t.forEach(s=>{const i=`${s.date}-${s.kasa}`;(!a[i]||s.shift==="aksam")&&(a[i]=s)});const e={sabah:0,aksam:0};return Object.values(a).forEach(s=>{const i=parseFloat(s.rumeli_z2||0)+parseFloat(s.rumeli_z1||0)+parseFloat(s.balik_ekmek||0)+parseFloat(s.dondurma||0);s.shift==="sabah"?e.sabah+=i:s.shift==="aksam"&&(e.aksam+=i)}),e}function P(t,a){const e={};return t.forEach(s=>{var l;const i=((l=s.cashiers)==null?void 0:l.name)||"Bilinmiyor";e[i]||(e[i]=0),e[i]+=parseFloat(s.individual_revenue||0)}),e}function H(t,a){const e=new Date().toISOString().split("T")[0],s=t.filter(d=>d.date===e),i=[...new Set(s.map(d=>d.cashier_id))],l=a.filter(d=>!i.includes(d.id)),r=t.filter(d=>!d.is_on_time),u=B(t),n=Math.max(...u.data,0);return{notEntered:l,lateEntries:r,maxCiro:n}}function j(t){const a=B(t),e=Math.max(...a.data,0),s=new Date().toISOString().split("T")[0],i=t.filter(d=>d.date===s),r=[...new Set(i.map(d=>d.cashier_id))].length;return{maxDailyCiro:e,activeCashiers:r,avgEntryTime:"2.5dk",weeklyGrowth:"+12%"}}function q(){const t=new Date,a=t.getDay(),e=["2026-01-01","2026-04-23","2026-05-01","2026-05-19","2026-08-30","2026-10-29"],s=t.toISOString().split("T")[0];return e.includes(s)?"special":a===0||a===6?"weekend":"weekday"}async function Y(){try{const t=q();console.log("Hedef tipi:",t);const{data:a,error:e}=await b.from("targets").select("amount").eq("target_type",t).single();return e?(console.error("Hedef çekme hatası:",e),{weekday:15e4,weekend:2e5,special:25e4}[t]):(console.log("Çekilen hedef:",a.amount),parseFloat(a.amount)||15e4)}catch(t){return console.error("fetchDailyTarget hatası:",t),15e4}}function V(){typeof anime>"u"||(anime({targets:".kasa-card, .sc, .total-hero-card",opacity:[0,1],translateY:[40,0],delay:anime.stagger(100),duration:800,easing:"easeOutCubic"}),anime({targets:".rank-card",opacity:[0,1],translateX:[-40,0],delay:anime.stagger(120),duration:700,easing:"easeOutCubic"}))}function N(){if(typeof anime>"u")return;const t=document.getElementById("totalDailyCiro"),a=parseFloat(t.getAttribute("data-value")||0);anime({targets:{value:0},value:a,duration:2e3,easing:"easeOutExpo",update:function(i){t.textContent=v(i.animations[0].currentValue)}});const e=document.getElementById("progressBarFill"),s=parseFloat(e.getAttribute("data-percent")||0);anime({targets:"#progressBarFill",width:s+"%",duration:1500,easing:"easeInOutQuad"})}function Z(t){const a={gida:{name:"Gıda",icon:"🥗",total:0,color:"#22c55e"},kahvalti:{name:"Kahvaltı",icon:"🥐",total:0,color:"#f59e0b"},kahve:{name:"Kahve",icon:"☕",total:0,color:"#8b5cf6"},meyvesuyu:{name:"Meyve Suyu",icon:"🧃",total:0,color:"#ec4899"},sicak_icecek:{name:"Sıcak İçecek",icon:"🔥",total:0,color:"#ef4444"},soguk_icecek:{name:"Soğuk İçecek",icon:"🥤",total:0,color:"#3b82f6"},tatli:{name:"Tatlı",icon:"🍰",total:0,color:"#a855f7"}},e={};t.forEach(l=>{const r=`${l.date}-${l.kasa}`;(!e[r]||l.shift==="aksam")&&(e[r]=l)}),Object.values(e).forEach(l=>{a.gida.total+=parseFloat(l.gida)||0,a.kahvalti.total+=parseFloat(l.kahvalti)||0,a.kahve.total+=parseFloat(l.kahve)||0,a.meyvesuyu.total+=parseFloat(l.meyvesuyu)||0,a.sicak_icecek.total+=parseFloat(l.sicak_icecek)||0,a.soguk_icecek.total+=parseFloat(l.soguk_icecek)||0,a.tatli.total+=parseFloat(l.tatli)||0});const s=Object.values(a).reduce((l,r)=>l+r.total,0);Object.values(a).forEach(l=>{l.percentage=s>0?l.total/s*100:0});const i=Object.entries(a).map(([l,r])=>({key:l,...r})).sort((l,r)=>r.total-l.total);return{categories:i,total:s,highest:i[0],lowest:i[i.length-1],average:s/i.length}}function W(t){return t.categories.map(a=>`
                <div class="category-card">
                    <div class="category-header">
                        <span class="category-icon">${a.icon}</span>
                        <span class="category-name">${a.name}</span>
                    </div>
                    <div class="category-amount">${v(a.total)}</div>
                    <div class="category-stats">
                        <span class="category-percentage">${a.percentage.toFixed(1)}% pay</span>
                    </div>
                </div>
            `).join("")}function U(t){var e;const a=((e=t.categories[0])==null?void 0:e.total)||1;return t.categories.map(s=>{const i=a>0?s.total/a*100:0;return`
                    <div class="category-bar">
                        <div class="category-bar-label">${s.icon} ${s.name}</div>
                        <div class="category-bar-track">
                            <div class="category-bar-fill" style="width:${i}%;background:${s.color};">
                                ${f(s.total)}
                            </div>
                        </div>
                    </div>
                `}).join("")}function Q(t){return`
                <div class="category-summary-card">
                    <div class="summary-icon">🏆</div>
                    <div class="summary-label">En Çok Satan</div>
                    <div class="summary-value">${t.highest.icon} ${t.highest.name}</div>
                    <div style="font-size:12px;color:var(--acc);margin-top:4px;font-weight:600;">${f(t.highest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📉</div>
                    <div class="summary-label">En Az Satan</div>
                    <div class="summary-value">${t.lowest.icon} ${t.lowest.name}</div>
                    <div style="font-size:12px;color:var(--txt3);margin-top:4px;font-weight:600;">${f(t.lowest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📊</div>
                    <div class="summary-label">Kategori Ort.</div>
                    <div class="summary-value">${f(t.average)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">Kategori başına</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">💰</div>
                    <div class="summary-label">Kategori Toplamı</div>
                    <div class="summary-value">${f(t.total)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">7 kategori</div>
                </div>
            `}async function X(t,a,e){const s=await Y(),i=O(a),l=B(a),r=M(a),u=P(a),n=H(a,e),d=j(a),p=Z(a),m=t.length>0?t[0]:null,w=a.length,C=a.filter(o=>o.is_on_time).length,T=w>0?Math.round(C/w*100):0,D=[...new Set(a.map(o=>o.date))].length,z=D>0?i.total/D:0,L=i.total,K=c==="day"&&h?h:new Date().toISOString().split("T")[0],S={};a.filter(o=>o.date===K).forEach(o=>{const y=`${o.date}-${o.kasa}`;(!S[y]||o.shift==="aksam")&&(S[y]=o)});const R=Object.values(S).reduce((o,y)=>o+parseFloat(y.total_revenue||0),0),$=s>0?Math.min(100,Math.round(R/s*100)):0;document.getElementById("mainContent").innerHTML=`
            <!-- HERO -->
            <div id="heroSection" class="hero ${m&&m.weekly_points>0?"gold":"blue"}">
                <div class="hero-badge">🏆 HAFTANIN ELEMANI</div>
                <div class="hero-name">${m?m.name:"Henüz Veri Yok"}</div>
                <div class="hero-amt">${m&&m.weekly_points||0} Puan</div>
                <div class="hero-sub">
                    ${m?`${m.total_entries||0} giriş · ${v(m.total_revenue||0)}`:"İlk veriyi girin!"}
                </div>
            </div>

            <!-- GÜNLÜK TOPLAM HERO KARTI -->
            <div class="section-title">💰 Rumeli İskelesi Toplam Ciro</div>
            <div class="total-hero-card">
                <div class="total-hero-left">
                    <div class="total-hero-label">Günlük Toplam Ciro</div>
                    <div class="total-hero-amount" id="totalDailyCiro" data-value="${L}">0,00 ₺</div>
                    <div class="total-hero-breakdown">
                        <span class="breakdown-item">🍽️ <span id="breakdownRestoran">${f(i.restoran)}</span></span>
                        <span class="breakdown-item">☕ <span id="breakdownCafetarya">${f(i.cafetarya)}</span></span>
                        <span class="breakdown-item">🐟 <span id="breakdownBalik">${f(i.balik)}</span></span>
                        <span class="breakdown-item">🍦 <span id="breakdownDondurma">${f(i.dondurma)}</span></span>
                    </div>
                </div>
                <div class="total-hero-right">
                    <div class="target-section">
                        <div class="target-label">📊 Günlük Hedef</div>
                        <div class="target-amount" id="targetAmount">${v(s)}</div>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" id="progressBarFill" style="width:0%" data-percent="${$}"></div>
                        </div>
                        <div class="progress-percent" id="progressPercent">${$}% Tamamlandı</div>
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
                        <div class="target-amount">${v(s)}</div>
                    </div>
                    <div class="target-current-section">
                        <div class="target-label">Gerçekleşen</div>
                        <div class="target-current">${v(R)}</div>
                    </div>
                </div>
                <div class="target-progress-section">
                    <div class="progress-header">
                        <span class="progress-label">İlerleme</span>
                        <span class="progress-percent">${$}%</span>
                    </div>
                    <div class="progress-bar-wrapper">
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill" id="dailyProgressBar" data-percent="${$}" style="width:0%"></div>
                        </div>
                    </div>
                    <div class="progress-status">
                        ${$>=100?"🎉 Hedef Tamamlandı!":$>=80?"💪 Hedefe Yakın!":$>=50?"⏰ Yarı Yolda!":"🚀 Devam Edelim!"}
                    </div>
                </div>
            </div>

            <!-- TARİH FİLTRESİ -->
            <div class="date-filter-section">
                <div class="filter-label">📅 Tarih Aralığı:</div>
                <div class="filter-buttons">
                    <button class="filter-btn ${c==="day"?"active":""}" data-range="day" onclick="showDayPicker()">
                        📅 Belirli Gün
                    </button>
                    <button class="filter-btn ${c==="month"?"active":""}" data-range="month" onclick="setDateFilter('month')">
                        Bu Ay
                    </button>
                    <button class="filter-btn ${c==="week"?"active":""}" data-range="week" onclick="setDateFilter('week')">
                        Bu Hafta
                    </button>
                    <button class="filter-btn ${c==="all"?"active":""}" data-range="all" onclick="setDateFilter('all')">
                        Tümü
                    </button>
                    <button class="filter-btn ${c==="custom"?"active":""}" data-range="custom" onclick="showCustomDatePicker()">
                        Özel Aralık ▼
                    </button>
                </div>
                <div class="filter-info" id="filterInfo">
                    ${c==="week"?"Son 7 gün":c==="month"?"Son 30 gün":c==="all"?"Tüm veriler":c==="day"&&h?new Date(h).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}):k?`${new Date(k).toLocaleDateString("tr-TR")} - ${new Date(E).toLocaleDateString("tr-TR")}`:"Son 30 gün"}
                </div>
            </div>

            <!-- KASİYER SIRALAMALARI -->
            <div class="section-title">👥 Kasiyer Sıralaması</div>
            <div id="rankGrid" class="rank-grid">
                ${t.slice(0,4).map((o,y)=>`
                    <div class="rank-card">
                        <div class="rank-pos p${y+1}">#${y+1}</div>
                        <div class="rank-avatar av-${ia(o.name)}">${ea(o.name)}</div>
                        <div class="rank-info">
                            <div class="rank-name">${o.name}</div>
                            <div class="rank-meta">
                                ${o.total_entries||0} giriş · 
                                %${o.total_entries>0?Math.round((o.on_time_entries||0)/o.total_entries*100):0} zamanında
                            </div>
                        </div>
                        <div class="rank-right">
                            <div class="rank-pts">${o.weekly_points||0}</div>
                            <div class="rank-badge-pill">${sa(o.badge_level)}</div>
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
                    <div class="kasa-amount">${v(i.restoran)}</div>
                    <div class="kasa-sub">Rumeli Z2</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.restoran/i.total*100):0} toplam</div>
                </div>
                <div class="kasa-card cafetarya">
                    <div class="kasa-icon">☕</div>
                    <div class="kasa-label">Cafetarya</div>
                    <div class="kasa-amount">${v(i.cafetarya)}</div>
                    <div class="kasa-sub">Rumeli Z1</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.cafetarya/i.total*100):0} toplam</div>
                </div>
                <div class="kasa-card balik">
                    <div class="kasa-icon">🐟</div>
                    <div class="kasa-label">Balık Ekmek</div>
                    <div class="kasa-amount">${v(i.balik)}</div>
                    <div class="kasa-sub">Z Raporu</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.balik/i.total*100):0} toplam</div>
                </div>
                <div class="kasa-card dondurma">
                    <div class="kasa-icon">🍦</div>
                    <div class="kasa-label">Dondurma</div>
                    <div class="kasa-amount">${v(i.dondurma)}</div>
                    <div class="kasa-sub">Z Raporu</div>
                    <div class="kasa-percent up">%${i.total>1?Math.round(i.dondurma/i.total*100):0} toplam</div>
                </div>
            </div>

            <!-- ÖZET İSTATİSTİKLER -->
            <div class="section-title">📊 Özet İstatistikler</div>
            <div class="summary-grid">
                <div class="sc blue">
                    <div class="sc-l">Bu Hafta Toplam Ciro</div>
                    <div class="sc-v">${f(i.total)}</div>
                    <div class="sc-s">${D} günlük veri</div>
                </div>
                <div class="sc purple">
                    <div class="sc-l">Günlük Ortalama</div>
                    <div class="sc-v">${f(z)}</div>
                    <div class="sc-s">Son ${D} gün</div>
                </div>
                <div class="sc orange">
                    <div class="sc-l">Zamanında Giriş</div>
                    <div class="sc-v">%${T}</div>
                    <div class="sc-s">${C}/${w} giriş</div>
                </div>
                <div class="sc green">
                    <div class="sc-l">Toplam Giriş Sayısı</div>
                    <div class="sc-v">${w}</div>
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
                    <div class="sc-v" id="maxDailyCiro">${f(d.maxDailyCiro)}</div>
                    <div class="sc-s">Bu hafta rekor</div>
                </div>

                <div class="sc indigo">
                    <div class="sc-l">Aktif Kasiyer</div>
                    <div class="sc-v" id="activeCashiers">${d.activeCashiers}/${e.length}</div>
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
                ${W(p)}
            </div>

            <!-- Kategori Grafikler + Özet -->
            <div class="category-charts">
                <div class="category-chart-box">
                    <div class="chart-title">📊 Kategori Karşılaştırması</div>
                    ${U(p)}
                </div>
                <div class="category-chart-box">
                    <div class="chart-title">📋 Özet İstatistikler</div>
                    <div class="category-summary">
                        ${Q(p)}
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
                <div class="alert-card ${n.notEntered.length>0?"danger":"ok"}">
                    <div class="alert-title">
                        ${n.notEntered.length>0?"❌":"✅"} Bugün Giriş Yapmayanlar
                    </div>
                    ${n.notEntered.length===0?'<div class="alert-item">Tüm kasiyerler giriş yaptı!</div>':n.notEntered.map(o=>`
                            <div class="alert-item">
                                <span>${o.name}</span>
                                <span style="color:var(--red)">Giriş Yok</span>
                            </div>
                        `).join("")}
                </div>
                <div class="alert-card ${n.lateEntries.length>0?"warning":"ok"}">
                    <div class="alert-title">⚠️ Geç Girişler (Bu Hafta)</div>
                    ${n.lateEntries.length===0?'<div class="alert-item">Bu hafta geç giriş yok! 🎉</div>':n.lateEntries.slice(0,5).map(o=>{var y;return`
                            <div class="alert-item">
                                <span>${((y=o.cashiers)==null?void 0:y.name)||"Bilinmiyor"}</span>
                                <span style="color:var(--orange)">${A(o.entry_time)}</span>
                            </div>
                        `}).join("")}
                </div>
                <div class="alert-card ok">
                    <div class="alert-title">📊 Haftalık Özet</div>
                    <div class="alert-item">
                        <span>En Yüksek Gün</span>
                        <span style="color:var(--green)">${v(n.maxCiro)}</span>
                    </div>
                    <div class="alert-item">
                        <span>Toplam Puan</span>
                        <span style="color:var(--orange)">${t.reduce((o,y)=>o+(y.weekly_points||0),0)}</span>
                    </div>
                    <div class="alert-item">
                        <span>Aktif Kasiyer</span>
                        <span style="color:var(--green)">${t.filter(o=>(o.total_entries||0)>0).length}/${e.length}</span>
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
                        ${e.map(o=>`<option value="${o.id}">${o.name}</option>`).join("")}
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
                            ${I(a)}
                        </tbody>
                    </table>
                </div>
            </div>
        `,J(l,i,r,u),document.getElementById("applyFiltersBtn").addEventListener("click",aa),document.getElementById("clearFiltersBtn").addEventListener("click",ta),document.getElementById("lastUpdate").textContent="Son güncelleme: "+new Date().toLocaleTimeString("tr-TR"),setTimeout(()=>{V(),N()},100),setTimeout(()=>{const o=document.getElementById("dailyProgressBar");o&&(o.style.width=Math.min(100,parseFloat(o.dataset.percent))+"%")},200)}let g={};function J(t,a,e,s){Chart.defaults.color="#7a8ba8",Chart.defaults.borderColor="#1e3a5f",Chart.defaults.font.family="DM Sans";const i=document.getElementById("dailyChart");i&&(g.daily&&g.daily.destroy(),g.daily=new Chart(i,{type:"bar",data:{labels:t.labels.length>0?t.labels:["Veri Yok"],datasets:[{label:"Günlük Ciro (₺)",data:t.data.length>0?t.data:[0],backgroundColor:"rgba(59,130,246,.7)",borderColor:"#3b82f6",borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:n=>"₺"+new Intl.NumberFormat("tr-TR").format(n)}}}}}));const l=document.getElementById("kasaChart");if(l){g.kasa&&g.kasa.destroy();const n=a.total>0,d=n?[a.restoran,a.cafetarya,a.balik,a.dondurma]:[.001,.001,.001,.001];g.kasa=new Chart(l,{type:"doughnut",data:{labels:["Restoran","Cafetarya","Balık Ekmek","Dondurma"],datasets:[{data:d,backgroundColor:["rgba(59,130,246,.8)","rgba(139,92,246,.8)","rgba(6,182,212,.8)","rgba(236,72,153,.8)"],borderColor:"#111d32",borderWidth:3,hoverOffset:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{position:"bottom",labels:{padding:16,usePointStyle:!0}},tooltip:{enabled:n,callbacks:{label:p=>{const m=p.raw,w=p.dataset.data.reduce((T,D)=>T+D,0),C=Math.round(m/w*100);return` ${p.label}: ${v(m)} (%${C})`}}}},cutout:"65%"}})}const r=document.getElementById("shiftChart");r&&(g.shift&&g.shift.destroy(),g.shift=new Chart(r,{type:"bar",data:{labels:["Sabah Vardiyası","Akşam Vardiyası"],datasets:[{label:"Ciro (₺)",data:[e.sabah||0,e.aksam||0],backgroundColor:["rgba(245,158,11,.7)","rgba(139,92,246,.7)"],borderColor:["#f59e0b","#8b5cf6"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:n=>"₺"+new Intl.NumberFormat("tr-TR").format(n)}}}}}));const u=document.getElementById("cashierChart");if(u){g.cashier&&g.cashier.destroy();const n=Object.keys(s),d=Object.values(s);g.cashier=new Chart(u,{type:"bar",data:{labels:n.length>0?n:["Veri Yok"],datasets:[{label:"Ciro (₺)",data:d.length>0?d:[0],backgroundColor:["rgba(139,92,246,.7)","rgba(245,158,11,.7)","rgba(236,72,153,.7)","rgba(34,197,94,.7)"],borderColor:["#8b5cf6","#f59e0b","#ec4899","#22c55e"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:p=>"₺"+new Intl.NumberFormat("tr-TR").format(p)}}}}})}}let _=[];function I(t){return t.length===0?'<tr><td colspan="9" style="text-align:center;color:var(--txt2);padding:40px;">Henüz veri yok</td></tr>':t.map(a=>{var i;const e=parseFloat(a.total_revenue||0),s=parseFloat(a.individual_revenue||e);return`
                <tr>
                    <td>${F(a.date)}</td>
                    <td style="font-weight:600">${((i=a.cashiers)==null?void 0:i.name)||"-"}</td>
                    <td><span class="badge ${a.kasa||""}">${a.kasa==="restoran"?"🍽️ Restoran":a.kasa==="cafetarya"?"☕ Cafetarya":"-"}</span></td>
                    <td><span class="badge ${a.shift||""}">${a.shift==="sabah"?"🌅 Sabah":a.shift==="aksam"?"🌙 Akşam":"-"}</span></td>
                    <td class="mono">${A(a.entry_time)}</td>
                    <td class="r">
                        <div class="mono" style="font-weight:700;color:var(--txt);">${v(s)}</div>
                        ${a.shift==="aksam"&&e!==s?`<div style="font-size:11px;color:var(--txt3);">EOD Toplam: ${v(e)}</div>`:""}
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
            `}).join("")}function aa(){const t=document.getElementById("filterDate").value,a=document.getElementById("filterKasiyer").value,e=document.getElementById("filterKasa").value,s=document.getElementById("filterVardiya").value;let i=[..._];t&&(i=i.filter(l=>l.date===t)),a&&(i=i.filter(l=>l.cashier_id===a)),e&&(i=i.filter(l=>l.kasa===e)),s&&(i=i.filter(l=>l.shift===s)),document.getElementById("entriesBody").innerHTML=I(i)}function ta(){document.getElementById("filterDate").value="",document.getElementById("filterKasiyer").value="",document.getElementById("filterKasa").value="",document.getElementById("filterVardiya").value="",document.getElementById("entriesBody").innerHTML=I(_)}function v(t){return new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(t||0)+" ₺"}function f(t){return t>=1e6?(t/1e6).toFixed(1)+"M ₺":t>=1e3?(t/1e3).toFixed(1)+"K ₺":v(t)}function F(t){return t?new Date(t).toLocaleDateString("tr-TR",{day:"2-digit",month:"2-digit"}):"-"}function A(t){return t?new Date(t).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"}):"-"}function ea(t){return t?t.split(" ").map(a=>a[0]).join(""):"??"}function ia(t){if(!t)return"t";const a=t.split(" ")[0];return{Tuba:"t",Elif:"e",Melda:"m",Ceren:"c"}[a]||"t"}function sa(t){return{yeni:"🆕 Yeni",bronz:"🥉 Bronz",gumus:"🥈 Gümüş",altin:"🥇 Altın",elmas:"💎 Elmas",efsane:"👑 Efsane"}[t]||"🆕 Yeni"}window.setDateFilter=function(t){c=t,k=null,E=null,document.querySelectorAll(".filter-btn").forEach(i=>i.classList.remove("active"));const a=document.querySelector(`[data-range="${t}"]`);a&&a.classList.add("active");const e={week:"Son 7 gün",month:"Son 30 gün",all:"Tüm veriler"},s=document.getElementById("filterInfo");s&&(s.textContent=e[t]||""),window.loadDashboard()};window.showDayPicker=function(){const t=document.createElement("div");t.className="custom-date-modal",t.style.display="flex",t.id="dayPickerModal",t.innerHTML=`
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
            `,document.body.appendChild(t),document.getElementById("singleDayPicker").value=h||new Date().toISOString().split("T")[0]};window.applyDayFilter=function(){const t=document.getElementById("singleDayPicker"),a=t==null?void 0:t.value;if(!a){alert("⚠️ Lütfen bir tarih seçin!");return}h=a,c="day",k=null,E=null,document.querySelectorAll(".filter-btn").forEach(r=>r.classList.remove("active"));const e=document.querySelector('[data-range="day"]');e&&e.classList.add("active");const s=new Date(a).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}),i=document.getElementById("filterInfo");i&&(i.textContent=s);const l=document.getElementById("dayPickerModal");l&&l.remove(),window.loadDashboard()};window.showCustomDatePicker=function(){const t=document.getElementById("customDateModal"),a=new Date().toISOString().split("T")[0];if(document.getElementById("customStartDate").max=a,document.getElementById("customEndDate").max=a,k)document.getElementById("customStartDate").value=k;else{const e=new Date;e.setDate(e.getDate()-7),document.getElementById("customStartDate").value=e.toISOString().split("T")[0]}document.getElementById("customEndDate").value=E||a,t.style.display="flex"};window.closeCustomDatePicker=function(){document.getElementById("customDateModal").style.display="none"};window.applyCustomDateRange=function(){const t=document.getElementById("customStartDate").value,a=document.getElementById("customEndDate").value;if(!t||!a){alert("⚠️ Lütfen başlangıç ve bitiş tarihlerini seçin!");return}if(t>a){alert("⚠️ Başlangıç tarihi bitiş tarihinden sonra olamaz!");return}k=t,E=a,c="custom",document.querySelectorAll(".filter-btn").forEach(r=>r.classList.remove("active"));const e=document.querySelector('[data-range="custom"]');e&&e.classList.add("active");const s=new Date(t).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),i=new Date(a).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),l=document.getElementById("filterInfo");l&&(l.textContent=`${s} - ${i}`),window.closeCustomDatePicker(),window.loadDashboard()};window.loadDashboard=async function(){try{document.getElementById("mainContent").innerHTML=`
                    <div class="loading">
                        <div class="spinner"></div>
                        <div>Veriler yükleniyor...</div>
                    </div>
                `;const{weekly:t,reports:a,cashiers:e}=await G();_=a,await X(t,a,e)}catch(t){console.error("Dashboard yükleme hatası:",t),document.getElementById("mainContent").innerHTML=`
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
            `,document.body.appendChild(a)};window.confirmDelete=async function(t){const a=document.querySelector(".modal-overlay");try{console.log("Siliniyor:",t);const{data:e,error:s}=await b.from("daily_reports").delete().eq("id",t);if(console.log("Delete response:",{data:e,error:s}),s)throw new Error(s.message);a&&a.remove(),x("✅ Kayıt başarıyla silindi!","success"),await loadDashboard()}catch(e){console.error("Silme hatası:",e),x("❌ Silme başarısız: "+e.message,"error"),a&&a.remove()}};window.editEntry=async function(t){console.log("editEntry çağrıldı:",t);const{data:a,error:e}=await b.from("daily_reports").select("*").eq("id",t).single();if(e){x("❌ Kayıt bulunamadı","error");return}const s=document.createElement("div");s.className="modal-overlay",s.innerHTML=`
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
            `,document.body.appendChild(s)};window.confirmEdit=async function(t){const a=document.querySelector(".modal-overlay");try{const e=parseFloat(document.getElementById("editZCiro").value)||0,s=parseInt(document.getElementById("editPuan").value)||0,i=document.getElementById("editDurum").value==="true";console.log("Güncelleniyor:",{entryId:t,newZCiro:e,newPuan:s,newDurum:i});const{error:l}=await b.from("daily_reports").update({total_revenue:e,points_earned:s,is_on_time:i}).eq("id",t);if(l)throw l;const{data:r}=await b.from("daily_reports").select("cashier_id").eq("id",t).single();if(!r)throw new Error("Kayıt bulunamadı");const{data:u}=await b.from("daily_reports").select("points_earned").eq("cashier_id",r.cashier_id),n=u.reduce((m,w)=>m+(parseInt(w.points_earned)||0),0);console.log("Toplam puan:",n);let d="yeni";n>=1e3?d="efsane":n>=500?d="elmas":n>=300?d="altin":n>=150?d="gumus":n>=50&&(d="bronz");const{error:p}=await b.from("cashiers").update({total_points:n,badge_level:d}).eq("id",r.cashier_id);if(p)throw p;a&&a.remove(),x("✅ Kayıt ve kasiyer puanı güncellendi!","success"),await loadDashboard()}catch(e){console.error("Güncelleme hatası:",e),x("❌ Güncelleme başarısız: "+e.message,"error"),a&&a.remove()}};function x(t,a="success"){const e=document.createElement("div");e.style.cssText=`
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
