import{s as v}from"./supabase-client-u-_gnSZj.js";import"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";const z=new URLSearchParams(window.location.search),h=z.get("cashier_id");h?B():(k("Kasiyer ID'si bulunamadı. Lütfen giriş sayfasından tekrar deneyin."),document.getElementById("loading").style.display="none");async function B(){try{const e=new Date,t=new Date(e.getFullYear(),e.getMonth(),1).toISOString().split("T")[0],[a,r,i,l]=await Promise.all([v.from("cashiers").select("*").eq("id",h).single(),v.from("daily_reports").select("*").eq("cashier_id",h).gte("date",t),v.from("daily_reports").select("cashier_id, points_earned, cashiers(name)").gte("date",t),v.from("entry_history").select("*").eq("cashier_id",h).order("entry_time",{ascending:!1}).limit(10)]);if(a.error)throw a.error;const o=a.data,s=r.data||[],n=i.data||[],d=l.data||[],y={entries:s.length,onTime:s.filter(c=>c.is_on_time).length,revenue:s.reduce((c,m)=>c+(parseFloat(m.individual_revenue)||0),0),points:s.reduce((c,m)=>c+(parseInt(m.points_earned)||0),0)},u={};n.forEach(c=>{var p;const m=c.cashier_id,x=((p=c.cashiers)==null?void 0:p.name)||"Bilinmiyor";u[m]||(u[m]={cashier_id:m,cashier_name:x,total_points:0,total_entries:0}),u[m].total_points+=parseInt(c.points_earned)||0,u[m].total_entries+=1});const g=Object.values(u).sort((c,m)=>m.total_points-c.total_points);$(o,y,g,d),await f(h),document.getElementById("loading").style.display="none",document.getElementById("dashboard").style.display="block"}catch(e){console.error("Dashboard yükleme hatası:",e),k("Dashboard yüklenirken bir hata oluştu: "+e.message),document.getElementById("loading").style.display="none"}}function $(e,t,a,r){const i={"Tuba Bozaklı":"av-t","Elif Yıldırım":"av-e","Melda Yılmaz":"av-m","Ceren Erdem":"av-c"},l=e.name.split(" ").map(g=>g[0]).join("");document.getElementById("profileAvatar").textContent=l,document.getElementById("profileAvatar").className="avatar "+(i[e.name]||"av-t"),document.getElementById("profileName").textContent=e.name,document.getElementById("profileRole").textContent=`Kasiyer - ${e.role||"Cafetarya"}`;const o=t.points;document.getElementById("totalPoints").textContent=o;const s=w(e.badge_level,o);document.getElementById("badgeIcon").textContent=s.icon,document.getElementById("badgeLabel").textContent=s.label;const n=I(o,e.badge_level);document.getElementById("nextBadge").textContent=n.label;const d=n.threshold-o;document.getElementById("pointsNeeded").textContent=d>0?`${d} puan kaldı`:"Tamamlandı!";const y=n.threshold>0?Math.min(o/n.threshold*100,100):100;document.getElementById("progressFill").style.width=y+"%",document.getElementById("statEntries").textContent=t.entries,document.getElementById("statOnTime").textContent=t.onTime,document.getElementById("statRevenue").textContent=b(t.revenue);const u=document.querySelectorAll(".stat-label");u[0]&&(u[0].textContent="Bu Ay Giriş"),C(a.slice(0,4),e.id),S(r)}function w(e,t){const a={ozel_yildiz:{icon:"🌟",label:"Yılın Yıldızı"},ozel_ates:{icon:"🔥",label:"Ateş Çıkışlı"},ozel_roket:{icon:"🚀",label:"Hızlı Yükseliş"},ozel_onur:{icon:"🏅",label:"Onur Madalyası"},ozel_takim:{icon:"🤝",label:"Takım Ruhu"}};return e&&a[e]?a[e]:t>=600?{icon:"👑⭐",label:"Süper Efsane"}:t>=400?{icon:"👑",label:"Efsane"}:t>=250?{icon:"💎",label:"Elmas"}:t>=150?{icon:"🥇",label:"Altın"}:t>=75?{icon:"🥈",label:"Gümüş"}:t>=30?{icon:"🥉",label:"Bronz"}:{icon:"🌱",label:"Yeni Başlayan"}}function I(e,t){return t!=null&&t.startsWith("ozel_")?{label:"Özel Rozet (Müdür)",threshold:e}:e>=600?{label:"Maksimum Seviye",threshold:600}:e>=400?{label:"Süper Efsane",threshold:600}:e>=250?{label:"Efsane",threshold:400}:e>=150?{label:"Elmas",threshold:250}:e>=75?{label:"Altın",threshold:150}:e>=30?{label:"Gümüş",threshold:75}:{label:"Bronz",threshold:30}}function C(e,t){const a=document.getElementById("leaderboard");a.innerHTML="";const r={"Tuba Bozaklı":"av-t","Elif Yıldırım":"av-e","Melda Yılmaz":"av-m","Ceren Erdem":"av-c"};e.forEach((i,l)=>{const o=l+1,s=i.cashier_id===t,n=i.cashier_name?i.cashier_name.split(" ").map(y=>y[0]).join(""):"??",d=document.createElement("div");d.className="leaderboard-item"+(s?" current":""),d.innerHTML=`
                    <div class="rank rank-${o}">#${o}</div>
                    <div class="leaderboard-avatar ${r[i.cashier_name]||"av-t"}">${n}</div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${i.cashier_name||"Bilinmiyor"}${s?" (Sen)":""}</div>
                        <div class="leaderboard-stats">${i.total_entries||0} giriş • ${i.on_time_entries||0} zamanında</div>
                    </div>
                    <div class="leaderboard-points">⭐ ${i.total_points||0}</div>
                `,a.appendChild(d)})}function S(e){const t=document.getElementById("historyBody");if(t.innerHTML="",e.length===0){t.innerHTML='<tr><td colspan="5" style="text-align: center; color: var(--txt2); padding: 40px">Henüz giriş kaydı yok</td></tr>';return}e.forEach(a=>{const r=document.createElement("tr"),i=new Date(a.entry_time),l=i.toLocaleDateString("tr-TR",{day:"2-digit",month:"short",year:"numeric"}),o=i.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"}),s=a.shift==="sabah"?"Sabah":"Akşam",n=a.shift==="sabah"?"shift-sabah":"shift-aksam",d=a.is_on_time?"✅":"⚠️",y=a.is_on_time?"Zamanında":"Geç",u=a.is_on_time?"status-ontime":"status-late";r.innerHTML=`
                    <td>
                        <div style="font-weight: 600">${l}</div>
                        <div style="font-size: 12px; color: var(--txt2)">${o}</div>
                    </td>
                    <td><span class="shift-badge ${n}">${s}</span></td>
                    <td><span class="status-badge ${u}">${d} ${y}</span></td>
                    <td class="mono">${b(a.revenue_amount||0)}</td>
                    <td class="mono" style="color: var(--gold)">+${a.points_earned||0}</td>
                `,t.appendChild(r)})}function b(e){return new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(e)+"₺"}function k(e){const t=document.getElementById("error");t.textContent="❌ "+e,t.style.display="block"}function E(e,t="success"){const a=document.createElement("div");a.style.cssText=`
                position:fixed;top:20px;right:20px;padding:14px 20px;border-radius:10px;
                font-weight:600;font-size:14px;z-index:9999;
                background:${t==="success"?"#064e3b":"#7f1d1d"};
                color:${t==="success"?"#6ee7b7":"#fca5a5"};
                border:1px solid ${t==="success"?"#065f46":"#991b1b"};
                box-shadow:0 8px 25px rgba(0,0,0,.3);
            `,a.textContent=e,document.body.appendChild(a),setTimeout(()=>a.remove(),3e3)}function M(e){return new Date(e+"T00:00:00").toLocaleDateString("tr-TR",{day:"2-digit",month:"2-digit"})}async function f(e){try{const t=new Date().toISOString().split("T")[0],a=new Date;a.setDate(a.getDate()-7);const r=a.toISOString().split("T")[0],{data:i,error:l}=await v.from("daily_reports").select("*").eq("cashier_id",e).gte("date",r).order("date",{ascending:!1}).order("entry_time",{ascending:!1});if(l)throw l;const o=i.filter(n=>n.date===t),s=i.filter(n=>n.date!==t);D(o,s)}catch(t){console.error("Girişleri çekme hatası:",t)}}function D(e,t){const a=document.getElementById("todayEntriesContainer"),r=document.getElementById("pastEntriesContainer");a.innerHTML=e.length===0?`<div style="text-align:center;padding:20px;color:var(--txt2);">
                       <div style="font-size:48px;margin-bottom:8px;">📭</div>
                       <div>Bugün henüz giriş yapmadınız</div>
                   </div>`:e.map(i=>_(i,!0)).join(""),r.innerHTML=t.length===0?`<div style="text-align:center;padding:20px;color:var(--txt2);">
                       <div style="font-size:48px;margin-bottom:8px;">📂</div>
                       <div>Geçmiş giriş bulunamadı</div>
                   </div>`:t.map(i=>_(i,!1)).join("")}function _(e,t){const a={restoran:"🍽️ Restoran",cafetarya:"☕ Cafetarya"}[e.kasa]||e.kasa,r={sabah:"🌅 Sabah",aksam:"🌙 Akşam",ogle:"🌙 Öğle"}[e.shift]||e.shift,i=parseFloat(e.individual_revenue)||(parseFloat(e.rumeli_z1)||0)+(parseFloat(e.rumeli_z2)||0)+(parseFloat(e.balik_ekmek)||0)+(parseFloat(e.dondurma)||0),l=new Date(e.entry_time).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"}),o=t?`<div class="entry-actions">
                       <button class="entry-btn edit"   onclick="editMyEntry('${e.id}')">✏️ Düzenle</button>
                       <button class="entry-btn delete" onclick="deleteMyEntry('${e.id}')">🗑️ Sil</button>
                   </div>`:`<div style="text-align:center;font-size:11px;color:var(--txt3);padding:8px;">
                       Geçmiş girişler düzenlenemez
                   </div>`;return`
                <div class="entry-card" data-entry-id="${e.id}">
                    <div class="entry-header">
                        <div>
                            <div style="font-weight:700;margin-bottom:4px;">${M(e.date)}</div>
                            <div class="entry-time">⏰ ${l}</div>
                        </div>
                        <span class="entry-badge ${e.is_on_time?"on-time":"late"}">
                            ${e.is_on_time?"✅ Zamanında":"⚠️ Geç"}
                        </span>
                    </div>
                    <div class="entry-details">
                        <div class="entry-detail">
                            <div class="entry-detail-label">Kasa</div>
                            <div class="entry-detail-value">${a}</div>
                        </div>
                        <div class="entry-detail">
                            <div class="entry-detail-label">Vardiya</div>
                            <div class="entry-detail-value">${r}</div>
                        </div>
                        <div class="entry-detail">
                            <div class="entry-detail-label">Vardiya Cirosu</div>
                            <div class="entry-detail-value">${b(i)}</div>
                        </div>
                        <div class="entry-detail">
                            <div class="entry-detail-label">Puan</div>
                            <div class="entry-detail-value" style="color:var(--orange);">+${e.points_earned}</div>
                        </div>
                    </div>
                    ${o}
                </div>`}window.editMyEntry=async function(e){try{const{data:t,error:a}=await v.from("daily_reports").select("*").eq("id",e).single();if(a)throw a;const r=[{id:"editRumeliZ1",db:"rumeli_z1",label:"Rumeli Z1 (Cafetarya)"},{id:"editRumeliZ2",db:"rumeli_z2",label:"Rumeli Z2 (Restoran)"},{id:"editBalikEkmek",db:"balik_ekmek",label:"Balık Ekmek"},{id:"editDondurma",db:"dondurma",label:"Dondurma"}].filter(n=>t[n.db]!==null&&t[n.db]!==0),i={gida:"Gıda",kahvalti:"Kahvaltı",kahve:"Kahve",meyvesuyu:"Meyve Suyu",sicak_icecek:"Sıcak İçecek",soguk_icecek:"Soğuk İçecek",tatli:"Tatlı",salata:"Salata",dondurma_kategori:"Dondurma (Kategori)"},l=Object.keys(i).filter(n=>t[n]!==null&&t[n]!==0).map(n=>({id:"editCat_"+n,db:n,label:i[n]})),o=n=>n.map(d=>`
                    <div class="edit-field">
                        <label>${d.label}</label>
                        <input type="number" id="${d.id}" value="${t[d.db]}" step="0.01">
                    </div>`).join(""),s=document.createElement("div");s.className="edit-modal-overlay",s.innerHTML=`
                    <div class="edit-modal-box">
                        <div class="edit-modal-header">
                            <h2>✏️ Girişi Düzenle</h2>
                            <button onclick="this.closest('.edit-modal-overlay').remove()" class="close-btn">✕</button>
                        </div>
                        <div class="edit-modal-content">
                            <div class="edit-info-card">
                                <strong>ℹ️ Önemli:</strong> Sadece bugün girdiğiniz verileri düzenleyebilirsiniz.
                                Z raporu ve kategori değerlerini dikkatli kontrol edin.
                            </div>
                            ${r.length>0?`
                            <div class="edit-section">
                                <h3>💰 Z Raporu Değerleri</h3>
                                <div class="edit-grid">${o(r)}</div>
                            </div>`:""}
                            ${l.length>0?`
                            <div class="edit-section">
                                <h3>🍽️ Kategori Satışları</h3>
                                <div class="edit-grid">${o(l)}</div>
                            </div>`:""}
                        </div>
                        <div class="edit-modal-actions">
                            <button onclick="this.closest('.edit-modal-overlay').remove()" class="modal-btn cancel">İptal</button>
                            <button onclick="confirmEditMyEntry('${e}')" class="modal-btn save">💾 Kaydet</button>
                        </div>
                    </div>`,document.body.appendChild(s)}catch(t){console.error("Düzenleme modal hatası:",t),alert("❌ Giriş yüklenemedi: "+t.message)}};window.confirmEditMyEntry=async function(e){try{const t={};Object.entries({editRumeliZ1:"rumeli_z1",editRumeliZ2:"rumeli_z2",editBalikEkmek:"balik_ekmek",editDondurma:"dondurma"}).forEach(([l,o])=>{const s=document.getElementById(l);s&&(t[o]=parseFloat(s.value)||0)}),["gida","kahvalti","kahve","meyvesuyu","sicak_icecek","soguk_icecek","tatli","salata","dondurma_kategori"].forEach(l=>{const o=document.getElementById("editCat_"+l);o&&(t[l]=parseFloat(o.value)||0)}),t.total_revenue=(t.rumeli_z1||0)+(t.rumeli_z2||0)+(t.balik_ekmek||0)+(t.dondurma||0);const{error:i}=await v.from("daily_reports").update(t).eq("id",e);if(i)throw i;document.querySelector(".edit-modal-overlay").remove(),E("✅ Giriş başarıyla güncellendi!","success"),await f(h)}catch(t){console.error("Güncelleme hatası:",t),alert("❌ Güncelleme başarısız: "+t.message)}};window.deleteMyEntry=async function(e){if(confirm(`⚠️ Bu girişi silmek istediğinize emin misiniz?

Bu işlem geri alınamaz!`))try{const{error:t}=await v.from("daily_reports").delete().eq("id",e);if(t)throw t;E("✅ Giriş silindi!","success"),await f(h)}catch(t){console.error("Silme hatası:",t),alert("❌ Silme başarısız: "+t.message)}};window.showScoringInfo=function(){document.getElementById("scoringInfoModal").style.display="flex"};window.closeScoringInfo=function(){document.getElementById("scoringInfoModal").style.display="none"};
