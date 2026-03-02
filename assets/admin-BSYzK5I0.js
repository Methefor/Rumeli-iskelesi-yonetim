import{s as h}from"./supabase-client-DmvsPI0b.js";import"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";let c="month",k=null,$=null,b=null;async function O(){let a,t=null;const e=new Date;if(c==="day"&&b)a=b,t=b;else if(c==="custom"&&k&&$)a=k,t=$;else switch(c){case"week":const v=new Date;v.setDate(v.getDate()-7),a=v.toISOString().split("T")[0];break;case"month":a=new Date(e.getFullYear(),e.getMonth(),1).toISOString().split("T")[0];break;case"lastmonth":a=new Date(e.getFullYear(),e.getMonth()-1,1).toISOString().split("T")[0],t=new Date(e.getFullYear(),e.getMonth(),0).toISOString().split("T")[0];break;case"all":a="2020-01-01";break;default:a=new Date(e.getFullYear(),e.getMonth(),1).toISOString().split("T")[0]}let s=h.from("daily_reports").select("*, cashiers(name)").gte("date",a).order("date",{ascending:!1});t&&(s=s.lte("date",t));const[i,l,r]=await Promise.all([h.from("weekly_performance").select("*").order("weekly_points",{ascending:!1}),s,h.from("cashiers").select("*").order("total_points",{ascending:!1})]);return{weekly:i.data||[],reports:l.data||[],cashiers:r.data||[]}}function P(a){const t={};return a.forEach(e=>{const s=`${e.date}-${e.kasa}`;(!t[s]||e.shift==="aksam")&&(t[s]=e)}),Object.values(t).reduce((e,s)=>(e.restoran+=parseFloat(s.rumeli_z2||0),e.cafetarya+=parseFloat(s.rumeli_z1||0),e.balik+=parseFloat(s.balik_ekmek||0),e.dondurma+=parseFloat(s.dondurma||0),e.total+=parseFloat(s.rumeli_z2||0)+parseFloat(s.rumeli_z1||0)+parseFloat(s.balik_ekmek||0)+parseFloat(s.dondurma||0),e),{restoran:0,cafetarya:0,balik:0,dondurma:0,total:0})}function B(a){const t={};a.forEach(i=>{const l=`${i.date}-${i.kasa}`;(!t[l]||i.shift==="aksam")&&(t[l]=i)});const e={};Object.values(t).forEach(i=>{const l=i.date;e[l]||(e[l]=0),e[l]+=parseFloat(i.rumeli_z2||0)+parseFloat(i.rumeli_z1||0)+parseFloat(i.balik_ekmek||0)+parseFloat(i.dondurma||0)});const s=Object.keys(e).sort();return{labels:s.map(i=>L(i)),data:s.map(i=>e[i])}}function H(a){const t={};a.forEach(s=>{const i=`${s.date}-${s.kasa}`;(!t[i]||s.shift==="aksam")&&(t[i]=s)});const e={sabah:0,aksam:0};return Object.values(t).forEach(s=>{const i=parseFloat(s.rumeli_z2||0)+parseFloat(s.rumeli_z1||0)+parseFloat(s.balik_ekmek||0)+parseFloat(s.dondurma||0);s.shift==="sabah"?e.sabah+=i:s.shift==="aksam"&&(e.aksam+=i)}),e}function Y(a,t){const e={};return a.forEach(s=>{var l;const i=((l=s.cashiers)==null?void 0:l.name)||"Bilinmiyor";e[i]||(e[i]=0),e[i]+=parseFloat(s.individual_revenue||0)}),e}function V(a,t){const e=new Date().toISOString().split("T")[0],s=a.filter(d=>d.date===e),i=[...new Set(s.map(d=>d.cashier_id))],l=t.filter(d=>!i.includes(d.id)),r=a.filter(d=>!d.is_on_time),v=B(a),o=Math.max(...v.data,0);return{notEntered:l,lateEntries:r,maxCiro:o}}function j(a){const t=B(a),e=Math.max(...t.data,0),s=new Date().toISOString().split("T")[0],i=a.filter(d=>d.date===s),r=[...new Set(i.map(d=>d.cashier_id))].length;return{maxDailyCiro:e,activeCashiers:r,avgEntryTime:"2.5dk",weeklyGrowth:"+12%"}}function q(){const a=new Date,t=a.getDay(),e=["2026-01-01","2026-04-23","2026-05-01","2026-05-19","2026-08-30","2026-10-29"],s=a.toISOString().split("T")[0];return e.includes(s)?"special":t===0||t===6?"weekend":"weekday"}async function N(){try{const a=q();console.log("Hedef tipi:",a);const{data:t,error:e}=await h.from("targets").select("amount").eq("target_type",a).single();return e?(console.error("Hedef çekme hatası:",e),{weekday:15e4,weekend:2e5,special:25e4}[a]):(console.log("Çekilen hedef:",t.amount),parseFloat(t.amount)||15e4)}catch(a){return console.error("fetchDailyTarget hatası:",a),15e4}}function Z(){typeof anime>"u"||(anime({targets:".kasa-card, .sc, .total-hero-card",opacity:[0,1],translateY:[40,0],delay:anime.stagger(100),duration:800,easing:"easeOutCubic"}),anime({targets:".rank-card",opacity:[0,1],translateX:[-40,0],delay:anime.stagger(120),duration:700,easing:"easeOutCubic"}))}function W(){if(typeof anime>"u")return;const a=document.getElementById("totalDailyCiro"),t=parseFloat(a.getAttribute("data-value")||0);anime({targets:{value:0},value:t,duration:2e3,easing:"easeOutExpo",update:function(i){a.textContent=m(i.animations[0].currentValue)}});const e=document.getElementById("progressBarFill"),s=parseFloat(e.getAttribute("data-percent")||0);anime({targets:"#progressBarFill",width:s+"%",duration:1500,easing:"easeInOutQuad"})}function U(a){const t={gida:{name:"Gıda",icon:"🥗",total:0,color:"#22c55e"},kahvalti:{name:"Kahvaltı",icon:"🥐",total:0,color:"#f59e0b"},kahve:{name:"Kahve",icon:"☕",total:0,color:"#8b5cf6"},meyvesuyu:{name:"Meyve Suyu",icon:"🧃",total:0,color:"#ec4899"},sicak_icecek:{name:"Sıcak İçecek",icon:"🔥",total:0,color:"#ef4444"},soguk_icecek:{name:"Soğuk İçecek",icon:"🥤",total:0,color:"#3b82f6"},tatli:{name:"Tatlı",icon:"🍰",total:0,color:"#a855f7"}},e={};a.forEach(l=>{const r=`${l.date}-${l.kasa}`;(!e[r]||l.shift==="aksam")&&(e[r]=l)}),Object.values(e).forEach(l=>{t.gida.total+=parseFloat(l.gida)||0,t.kahvalti.total+=parseFloat(l.kahvalti)||0,t.kahve.total+=parseFloat(l.kahve)||0,t.meyvesuyu.total+=parseFloat(l.meyvesuyu)||0,t.sicak_icecek.total+=parseFloat(l.sicak_icecek)||0,t.soguk_icecek.total+=parseFloat(l.soguk_icecek)||0,t.tatli.total+=parseFloat(l.tatli)||0});const s=Object.values(t).reduce((l,r)=>l+r.total,0);Object.values(t).forEach(l=>{l.percentage=s>0?l.total/s*100:0});const i=Object.entries(t).map(([l,r])=>({key:l,...r})).sort((l,r)=>r.total-l.total);return{categories:i,total:s,highest:i[0],lowest:i[i.length-1],average:s/i.length}}function Q(a){return a.categories.map(t=>`
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
            `).join("")}function X(a){var e;const t=((e=a.categories[0])==null?void 0:e.total)||1;return a.categories.map(s=>{const i=t>0?s.total/t*100:0;return`
                    <div class="category-bar">
                        <div class="category-bar-label">${s.icon} ${s.name}</div>
                        <div class="category-bar-track">
                            <div class="category-bar-fill" style="width:${i}%;background:${s.color};">
                                ${f(s.total)}
                            </div>
                        </div>
                    </div>
                `}).join("")}function J(a){return`
                <div class="category-summary-card">
                    <div class="summary-icon">🏆</div>
                    <div class="summary-label">En Çok Satan</div>
                    <div class="summary-value">${a.highest.icon} ${a.highest.name}</div>
                    <div style="font-size:12px;color:var(--acc);margin-top:4px;font-weight:600;">${f(a.highest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📉</div>
                    <div class="summary-label">En Az Satan</div>
                    <div class="summary-value">${a.lowest.icon} ${a.lowest.name}</div>
                    <div style="font-size:12px;color:var(--txt3);margin-top:4px;font-weight:600;">${f(a.lowest.total)}</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">📊</div>
                    <div class="summary-label">Kategori Ort.</div>
                    <div class="summary-value">${f(a.average)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">Kategori başına</div>
                </div>
                <div class="category-summary-card">
                    <div class="summary-icon">💰</div>
                    <div class="summary-label">Kategori Toplamı</div>
                    <div class="summary-value">${f(a.total)}</div>
                    <div style="font-size:12px;color:var(--txt2);margin-top:4px;">7 kategori</div>
                </div>
            `}async function tt(a,t,e){const s=await N(),i=P(t),l=B(t),r=H(t),v=Y(t),o=V(t,e),d=j(t),g=U(t),u=a.length>0?a[0]:null,w=t.length,T=t.filter(n=>n.is_on_time).length,C=w>0?Math.round(T/w*100):0,E=[...new Set(t.map(n=>n.date))].length,G=E>0?i.total/E:0,K=i.total,M=c==="day"&&b?b:new Date().toISOString().split("T")[0],S={};t.filter(n=>n.date===M).forEach(n=>{const y=`${n.date}-${n.kasa}`;(!S[y]||n.shift==="aksam")&&(S[y]=n)});const R=Object.values(S).reduce((n,y)=>n+parseFloat(y.total_revenue||0),0),D=s>0?Math.min(100,Math.round(R/s*100)):0;document.getElementById("mainContent").innerHTML=`
            <!-- HERO -->
            <div id="heroSection" class="hero ${u&&u.weekly_points>0?"gold":"blue"}">
                <div class="hero-badge">🏆 HAFTANIN ELEMANI</div>
                <div class="hero-name">${u?u.name:"Henüz Veri Yok"}</div>
                <div class="hero-amt">${u&&u.weekly_points||0} Puan</div>
                <div class="hero-sub">
                    ${u?`${u.total_entries||0} giriş · ${m(u.total_revenue||0)}`:"İlk veriyi girin!"}
                </div>
            </div>

            <!-- GÜNLÜK TOPLAM HERO KARTI -->
            <div class="section-title">💰 Rumeli İskelesi Toplam Ciro</div>
            <div class="total-hero-card">
                <div class="total-hero-left">
                    <div class="total-hero-label">Günlük Toplam Ciro</div>
                    <div class="total-hero-amount" id="totalDailyCiro" data-value="${K}">0,00 ₺</div>
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
                        <div class="target-amount" id="targetAmount">${m(s)}</div>
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
                        <div class="target-amount">${m(s)}</div>
                    </div>
                    <div class="target-current-section">
                        <div class="target-label">Gerçekleşen</div>
                        <div class="target-current">${m(R)}</div>
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
                    <button class="filter-btn ${c==="month"?"active":""}" data-range="month" onclick="setDateFilter('month')">
                        Bu Ay
                    </button>
                    <button class="filter-btn ${c==="lastmonth"?"active":""}" data-range="lastmonth" onclick="setDateFilter('lastmonth')">
                        Geçen Ay
                    </button>
                    <button class="filter-btn ${c==="week"?"active":""}" data-range="week" onclick="setDateFilter('week')">
                        Bu Hafta
                    </button>
                    <button class="filter-btn ${c==="all"?"active":""}" data-range="all" onclick="setDateFilter('all')">
                        Tümü
                    </button>
                    <button class="filter-btn ${c==="day"?"active":""}" data-range="day" onclick="showDayPicker()">
                        📅 Belirli Gün
                    </button>
                    <button class="filter-btn ${c==="custom"?"active":""}" data-range="custom" onclick="showCustomDatePicker()">
                        Özel Aralık ▼
                    </button>
                </div>
                <div class="filter-info" id="filterInfo">
                    ${c==="week"?"Son 7 gün":c==="month"?`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`:c==="lastmonth"?`Geçen Ay (${new Date(new Date().getFullYear(),new Date().getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`:c==="all"?"Tüm veriler":c==="day"&&b?new Date(b).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}):k?`${new Date(k).toLocaleDateString("tr-TR")} - ${new Date($).toLocaleDateString("tr-TR")}`:`Bu Ay (${new Date().toLocaleDateString("tr-TR",{month:"long",year:"numeric"})})`}
                </div>
            </div>

            <!-- KASİYER SIRALAMALARI -->
            <div class="section-title">👥 Kasiyer Sıralaması</div>
            <div id="rankGrid" class="rank-grid">
                ${a.slice(0,4).map((n,y)=>`
                    <div class="rank-card">
                        <div class="rank-pos p${y+1}">#${y+1}</div>
                        <div class="rank-avatar av-${lt(n.name)}">${st(n.name)}</div>
                        <div class="rank-info">
                            <div class="rank-name">${n.name}</div>
                            <div class="rank-meta">
                                ${n.total_entries||0} giriş · 
                                %${n.total_entries>0?Math.round((n.on_time_entries||0)/n.total_entries*100):0} zamanında
                            </div>
                        </div>
                        <div class="rank-right">
                            <div class="rank-pts">${n.weekly_points||0}</div>
                            <div class="rank-badge-pill">${nt(n.badge_level)}</div>
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
                    <div class="sc-v">${f(i.total)}</div>
                    <div class="sc-s">${E} günlük veri</div>
                </div>
                <div class="sc purple">
                    <div class="sc-l">Günlük Ortalama</div>
                    <div class="sc-v">${f(G)}</div>
                    <div class="sc-s">Son ${E} gün</div>
                </div>
                <div class="sc orange">
                    <div class="sc-l">Zamanında Giriş</div>
                    <div class="sc-v">%${C}</div>
                    <div class="sc-s">${T}/${w} giriş</div>
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
                ${Q(g)}
            </div>

            <!-- Kategori Grafikler + Özet -->
            <div class="category-charts">
                <div class="category-chart-box">
                    <div class="chart-title">📊 Kategori Karşılaştırması</div>
                    ${X(g)}
                </div>
                <div class="category-chart-box">
                    <div class="chart-title">📋 Özet İstatistikler</div>
                    <div class="category-summary">
                        ${J(g)}
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
                <div class="alert-card ${o.notEntered.length>0?"danger":"ok"}">
                    <div class="alert-title">
                        ${o.notEntered.length>0?"❌":"✅"} Bugün Giriş Yapmayanlar
                    </div>
                    ${o.notEntered.length===0?'<div class="alert-item">Tüm kasiyerler giriş yaptı!</div>':o.notEntered.map(n=>`
                            <div class="alert-item">
                                <span>${n.name}</span>
                                <span style="color:var(--red)">Giriş Yok</span>
                            </div>
                        `).join("")}
                </div>
                <div class="alert-card ${o.lateEntries.length>0?"warning":"ok"}">
                    <div class="alert-title">⚠️ Geç Girişler (Bu Hafta)</div>
                    ${o.lateEntries.length===0?'<div class="alert-item">Bu hafta geç giriş yok! 🎉</div>':o.lateEntries.slice(0,5).map(n=>{var y;return`
                            <div class="alert-item">
                                <span>${((y=n.cashiers)==null?void 0:y.name)||"Bilinmiyor"}</span>
                                <span style="color:var(--orange)">${z(n.entry_time)}</span>
                            </div>
                        `}).join("")}
                </div>
                <div class="alert-card ok">
                    <div class="alert-title">📊 Haftalık Özet</div>
                    <div class="alert-item">
                        <span>En Yüksek Gün</span>
                        <span style="color:var(--green)">${m(o.maxCiro)}</span>
                    </div>
                    <div class="alert-item">
                        <span>Toplam Puan</span>
                        <span style="color:var(--orange)">${a.reduce((n,y)=>n+(y.weekly_points||0),0)}</span>
                    </div>
                    <div class="alert-item">
                        <span>Aktif Kasiyer</span>
                        <span style="color:var(--green)">${a.filter(n=>(n.total_entries||0)>0).length}/${e.length}</span>
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
                            ${e.map(n=>`<option value="${n.id}">${n.name}</option>`).join("")}
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
                                ${_(t)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `,at(l,i,r,v);const F=document.getElementById("applyFiltersBtn"),A=document.getElementById("clearFiltersBtn");F&&F.addEventListener("click",et),A&&A.addEventListener("click",it),document.getElementById("lastUpdate").textContent="Son güncelleme: "+new Date().toLocaleTimeString("tr-TR"),setTimeout(()=>{Z(),W()},100),setTimeout(()=>{const n=document.getElementById("dailyProgressBar");n&&(n.style.width=Math.min(100,parseFloat(n.dataset.percent))+"%")},200)}let p={};function at(a,t,e,s){Chart.defaults.color="#7a8ba8",Chart.defaults.borderColor="#1e3a5f",Chart.defaults.font.family="DM Sans";const i=document.getElementById("dailyChart");i&&(p.daily&&p.daily.destroy(),p.daily=new Chart(i,{type:"bar",data:{labels:a.labels.length>0?a.labels:["Veri Yok"],datasets:[{label:"Günlük Ciro (₺)",data:a.data.length>0?a.data:[0],backgroundColor:"rgba(59,130,246,.7)",borderColor:"#3b82f6",borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:o=>"₺"+new Intl.NumberFormat("tr-TR").format(o)}}}}}));const l=document.getElementById("kasaChart");if(l){p.kasa&&p.kasa.destroy();const o=t.total>0,d=o?[t.restoran,t.cafetarya,t.balik,t.dondurma]:[.001,.001,.001,.001];p.kasa=new Chart(l,{type:"doughnut",data:{labels:["Restoran","Cafetarya","Balık Ekmek","Dondurma"],datasets:[{data:d,backgroundColor:["rgba(59,130,246,.8)","rgba(139,92,246,.8)","rgba(6,182,212,.8)","rgba(236,72,153,.8)"],borderColor:"#111d32",borderWidth:3,hoverOffset:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{position:"bottom",labels:{padding:16,usePointStyle:!0}},tooltip:{enabled:o,callbacks:{label:g=>{const u=g.raw,w=g.dataset.data.reduce((C,E)=>C+E,0),T=Math.round(u/w*100);return` ${g.label}: ${m(u)} (%${T})`}}}},cutout:"65%"}})}const r=document.getElementById("shiftChart");r&&(p.shift&&p.shift.destroy(),p.shift=new Chart(r,{type:"bar",data:{labels:["Sabah Vardiyası","Akşam Vardiyası"],datasets:[{label:"Ciro (₺)",data:[e.sabah||0,e.aksam||0],backgroundColor:["rgba(245,158,11,.7)","rgba(139,92,246,.7)"],borderColor:["#f59e0b","#8b5cf6"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:o=>"₺"+new Intl.NumberFormat("tr-TR").format(o)}}}}}));const v=document.getElementById("cashierChart");if(v){p.cashier&&p.cashier.destroy();const o=Object.keys(s),d=Object.values(s);p.cashier=new Chart(v,{type:"bar",data:{labels:o.length>0?o:["Veri Yok"],datasets:[{label:"Ciro (₺)",data:d.length>0?d:[0],backgroundColor:["rgba(139,92,246,.7)","rgba(245,158,11,.7)","rgba(236,72,153,.7)","rgba(34,197,94,.7)"],borderColor:["#8b5cf6","#f59e0b","#ec4899","#22c55e"],borderWidth:2,borderRadius:8}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{color:"#1e3a5f"}},y:{grid:{color:"#1e3a5f"},ticks:{callback:g=>"₺"+new Intl.NumberFormat("tr-TR").format(g)}}}}})}}let I=[];function _(a){return a.length===0?'<tr><td colspan="9" style="text-align:center;color:var(--txt2);padding:40px;">Henüz veri yok</td></tr>':a.map(t=>{var i;const e=parseFloat(t.total_revenue||0),s=parseFloat(t.individual_revenue||e);return`
                <tr>
                    <td>${L(t.date)}</td>
                    <td style="font-weight:600">${((i=t.cashiers)==null?void 0:i.name)||"-"}</td>
                    <td><span class="badge ${t.kasa||""}">${t.kasa==="restoran"?"🍽️ Restoran":t.kasa==="cafetarya"?"☕ Cafetarya":"-"}</span></td>
                    <td><span class="badge ${t.shift||""}">${t.shift==="sabah"?"🌅 Sabah":t.shift==="aksam"?"🌙 Akşam":"-"}</span></td>
                    <td class="mono">${z(t.entry_time)}</td>
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
            `}).join("")}function et(){const a=document.getElementById("filterDate").value,t=document.getElementById("filterKasiyer").value,e=document.getElementById("filterKasa").value,s=document.getElementById("filterVardiya").value;let i=[...I];a&&(i=i.filter(l=>l.date===a)),t&&(i=i.filter(l=>l.cashier_id===t)),e&&(i=i.filter(l=>l.kasa===e)),s&&(i=i.filter(l=>l.shift===s)),document.getElementById("entriesBody").innerHTML=_(i)}function it(){document.getElementById("filterDate").value="",document.getElementById("filterKasiyer").value="",document.getElementById("filterKasa").value="",document.getElementById("filterVardiya").value="",document.getElementById("entriesBody").innerHTML=_(I)}function m(a){return new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(a||0)+" ₺"}function f(a){return a>=1e6?(a/1e6).toFixed(1)+"M ₺":a>=1e3?(a/1e3).toFixed(1)+"K ₺":m(a)}function L(a){return a?new Date(a).toLocaleDateString("tr-TR",{day:"2-digit",month:"2-digit"}):"-"}function z(a){return a?new Date(a).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"}):"-"}function st(a){return a?a.split(" ").map(t=>t[0]).join(""):"??"}function lt(a){if(!a)return"t";const t=a.split(" ")[0];return{Tuba:"t",Elif:"e",Melda:"m",Ceren:"c"}[t]||"t"}function nt(a){return{yeni:"🆕 Yeni",bronz:"🥉 Bronz",gumus:"🥈 Gümüş",altin:"🥇 Altın",elmas:"💎 Elmas",efsane:"👑 Efsane"}[a]||"🆕 Yeni"}window.toggleDetails=function(){const a=document.getElementById("detailedSection"),t=document.getElementById("toggleIcon"),e=document.getElementById("toggleText");a&&(a.style.display==="none"?(a.style.display="block",t.textContent="🙈",e.textContent="Detaylı Verileri Gizle"):(a.style.display="none",t.textContent="👁️",e.textContent="Detaylı Verileri Göster"))};window.setDateFilter=function(a){c=a,k=null,$=null,document.querySelectorAll(".filter-btn").forEach(o=>o.classList.remove("active"));const t=document.querySelector(`[data-range="${a}"]`);t&&t.classList.add("active");const e=new Date,s=e.toLocaleDateString("tr-TR",{month:"long",year:"numeric"}),l=new Date(e.getFullYear(),e.getMonth()-1,1).toLocaleDateString("tr-TR",{month:"long",year:"numeric"}),r={week:"Son 7 gün",month:`Bu Ay (${s})`,lastmonth:`Geçen Ay (${l})`,all:"Tüm veriler"},v=document.getElementById("filterInfo");v&&(v.textContent=r[a]||""),window.loadDashboard()};window.showDayPicker=function(){const a=document.createElement("div");a.className="custom-date-modal",a.style.display="flex",a.id="dayPickerModal",a.innerHTML=`
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
            `,document.body.appendChild(a),document.getElementById("singleDayPicker").value=b||new Date().toISOString().split("T")[0]};window.applyDayFilter=function(){const a=document.getElementById("singleDayPicker"),t=a==null?void 0:a.value;if(!t){alert("⚠️ Lütfen bir tarih seçin!");return}b=t,c="day",k=null,$=null,document.querySelectorAll(".filter-btn").forEach(r=>r.classList.remove("active"));const e=document.querySelector('[data-range="day"]');e&&e.classList.add("active");const s=new Date(t).toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric"}),i=document.getElementById("filterInfo");i&&(i.textContent=s);const l=document.getElementById("dayPickerModal");l&&l.remove(),window.loadDashboard()};window.showCustomDatePicker=function(){const a=document.getElementById("customDateModal"),t=new Date().toISOString().split("T")[0];if(document.getElementById("customStartDate").max=t,document.getElementById("customEndDate").max=t,k)document.getElementById("customStartDate").value=k;else{const e=new Date;e.setDate(e.getDate()-7),document.getElementById("customStartDate").value=e.toISOString().split("T")[0]}document.getElementById("customEndDate").value=$||t,a.style.display="flex"};window.closeCustomDatePicker=function(){document.getElementById("customDateModal").style.display="none"};window.applyCustomDateRange=function(){const a=document.getElementById("customStartDate").value,t=document.getElementById("customEndDate").value;if(!a||!t){alert("⚠️ Lütfen başlangıç ve bitiş tarihlerini seçin!");return}if(a>t){alert("⚠️ Başlangıç tarihi bitiş tarihinden sonra olamaz!");return}k=a,$=t,c="custom",document.querySelectorAll(".filter-btn").forEach(r=>r.classList.remove("active"));const e=document.querySelector('[data-range="custom"]');e&&e.classList.add("active");const s=new Date(a).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),i=new Date(t).toLocaleDateString("tr-TR",{day:"2-digit",month:"short"}),l=document.getElementById("filterInfo");l&&(l.textContent=`${s} - ${i}`),window.closeCustomDatePicker(),window.loadDashboard()};window.loadDashboard=async function(){try{document.getElementById("mainContent").innerHTML=`
                    <div class="loading">
                        <div class="spinner"></div>
                        <div>Veriler yükleniyor...</div>
                    </div>
                `;const{weekly:a,reports:t,cashiers:e}=await O();I=t,await tt(a,t,e)}catch(a){console.error("Dashboard yükleme hatası:",a),document.getElementById("mainContent").innerHTML=`
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
            `,document.body.appendChild(t)};window.confirmDelete=async function(a){const t=document.querySelector(".modal-overlay");try{console.log("Siliniyor:",a);const{data:e,error:s}=await h.from("daily_reports").delete().eq("id",a);if(console.log("Delete response:",{data:e,error:s}),s)throw new Error(s.message);t&&t.remove(),x("✅ Kayıt başarıyla silindi!","success"),await loadDashboard()}catch(e){console.error("Silme hatası:",e),x("❌ Silme başarısız: "+e.message,"error"),t&&t.remove()}};window.editEntry=async function(a){console.log("editEntry çağrıldı:",a);const{data:t,error:e}=await h.from("daily_reports").select("*").eq("id",a).single();if(e){x("❌ Kayıt bulunamadı","error");return}const s=document.createElement("div");s.className="modal-overlay",s.innerHTML=`
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
            `,document.body.appendChild(s)};window.confirmEdit=async function(a){const t=document.querySelector(".modal-overlay");try{const e=parseFloat(document.getElementById("editZCiro").value)||0,s=parseInt(document.getElementById("editPuan").value)||0,i=document.getElementById("editDurum").value==="true";console.log("Güncelleniyor:",{entryId:a,newZCiro:e,newPuan:s,newDurum:i});const{error:l}=await h.from("daily_reports").update({total_revenue:e,points_earned:s,is_on_time:i}).eq("id",a);if(l)throw l;const{data:r}=await h.from("daily_reports").select("cashier_id").eq("id",a).single();if(!r)throw new Error("Kayıt bulunamadı");const{data:v}=await h.from("daily_reports").select("points_earned").eq("cashier_id",r.cashier_id),o=v.reduce((u,w)=>u+(parseInt(w.points_earned)||0),0);console.log("Toplam puan:",o);let d="yeni";o>=1e3?d="efsane":o>=500?d="elmas":o>=300?d="altin":o>=150?d="gumus":o>=50&&(d="bronz");const{error:g}=await h.from("cashiers").update({total_points:o,badge_level:d}).eq("id",r.cashier_id);if(g)throw g;t&&t.remove(),x("✅ Kayıt ve kasiyer puanı güncellendi!","success"),await loadDashboard()}catch(e){console.error("Güncelleme hatası:",e),x("❌ Güncelleme başarısız: "+e.message,"error"),t&&t.remove()}};function x(a,t="success"){const e=document.createElement("div");e.style.cssText=`
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
