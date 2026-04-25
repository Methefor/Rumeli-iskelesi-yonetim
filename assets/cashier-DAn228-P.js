import"./modulepreload-polyfill-B5Qt9EMX.js";import{supabase as f,updateShiftEntry as C}from"./supabase-client-D7cjvoTY.js";import"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";typeof window._cashierLoadOk=="function"&&window._cashierLoadOk();const S=new URLSearchParams(window.location.search),v=S.get("cashier_id");v?D():(x("Kasiyer ID'si bulunamadı. Lütfen giriş sayfasından tekrar deneyin."),document.getElementById("loading").style.display="none");function b(e){return e.getFullYear()+"-"+String(e.getMonth()+1).padStart(2,"0")+"-"+String(e.getDate()).padStart(2,"0")}async function D(){try{const e=new Date,t=b(new Date(e.getFullYear(),e.getMonth(),1)),a=b(new Date(e.getFullYear(),e.getMonth()+1,0)),[o,i,s,r]=await Promise.all([f.from("cashiers").select("*").eq("id",v).single(),f.from("daily_reports").select("*").eq("cashier_id",v).gte("date",t).lte("date",a),f.from("daily_reports").select("cashier_id, points_earned, is_on_time, rumeli_z1, total_revenue, cashiers(name)").gte("date",t).lte("date",a),f.from("entry_history").select("*").eq("cashier_id",v).order("entry_time",{ascending:!1}).limit(10)]);if(o.error)throw o.error;const d=o.data,n=i.data||[],c=s.data||[],u=r.data||[],y=n.reduce((l,m)=>l+(parseInt(m.points_earned)||0),0),g=n.length,I={entries:g,onTime:n.filter(l=>l.is_on_time).length,revenue:n.reduce((l,m)=>l+(parseFloat(m.individual_revenue)||0),0),points:y,performancePct:g>0?Math.round(y/(g*100)*100):0},p={};c.forEach(l=>{var k;const m=l.cashier_id,w=((k=l.cashiers)==null?void 0:k.name)||"Bilinmiyor";p[m]||(p[m]={cashier_id:m,cashier_name:w,total_score:0,total_entries:0,on_time_entries:0});const $=(l.is_on_time?50:0)+(parseFloat(l.rumeli_z1||0)>0||parseFloat(l.total_revenue||0)>0?50:0);p[m].total_score+=$,p[m].total_entries+=1,l.is_on_time&&(p[m].on_time_entries+=1)});const z=Object.values(p).map(l=>({...l,performance_pct:l.total_entries>0?Math.round(l.total_score/(l.total_entries*100)*100):0})).sort((l,m)=>m.performance_pct!==l.performance_pct?m.performance_pct-l.performance_pct:m.total_entries-l.total_entries);M(d,I,z,u),await _(v),document.getElementById("loading").style.display="none",document.getElementById("dashboard").style.display="block"}catch(e){console.error("Dashboard yükleme hatası:",e),x("Dashboard yüklenirken bir hata oluştu: "+e.message),document.getElementById("loading").style.display="none"}}function M(e,t,a,o){var u;const i={"Tuba Bozaklı":"av-t","Elif Yıldırım":"av-e","Melda Yılmaz":"av-m","Ceren Erdem":"av-c"},s=e.name.split(" ").map(y=>y[0]).join("");document.getElementById("profileAvatar").textContent=s,document.getElementById("profileAvatar").className="avatar "+(i[e.name]||"av-t"),document.getElementById("profileName").textContent=e.name,document.getElementById("profileRole").textContent="Kasiyer — Rumeli İskelesi";const r=t.performancePct,d=T(e.badge_level,r);document.getElementById("badgeIcon").textContent=d.icon,document.getElementById("badgeLabel").textContent=d.label,document.getElementById("totalPoints").textContent=t.entries>0?`%${r}`:"—",document.querySelector('[style*="puan"]')&&((u=document.querySelector('[style*="color: var(--txt2)"]'))==null?void 0:u.textContent)===" puan"&&(document.querySelector('[style*="color: var(--txt2)"]').textContent=" performans");const n=L(r,e.badge_level);document.getElementById("nextBadge").textContent=n.label,document.getElementById("pointsNeeded").textContent=n.pctLeft>0?`%${n.pctLeft} daha`:"Tamamlandı!",document.getElementById("progressFill").style.width=Math.min(r,100)+"%",document.getElementById("statEntries").textContent=t.entries,document.getElementById("statOnTime").textContent=t.onTime,document.getElementById("statRevenue").textContent=h(t.revenue);const c=document.querySelectorAll(".stat-label");c[0]&&(c[0].textContent="Bu Ay Giriş"),R(a.slice(0,4),v),F(o)}function T(e,t){const a={ozel_yildiz:{icon:"🌟",label:"Yılın Yıldızı"},ozel_ates:{icon:"🔥",label:"Ateş Çıkışlı"},ozel_roket:{icon:"🚀",label:"Hızlı Yükseliş"},ozel_onur:{icon:"🏅",label:"Onur Madalyası"},ozel_takim:{icon:"🤝",label:"Takım Ruhu"}};return e&&a[e]?a[e]:t>=95?{icon:"👑⭐",label:"Süper Efsane"}:t>=85?{icon:"👑",label:"Efsane"}:t>=75?{icon:"💎",label:"Elmas"}:t>=65?{icon:"🥇",label:"Altın"}:t>=50?{icon:"🥈",label:"Gümüş"}:t>=30?{icon:"🥉",label:"Bronz"}:{icon:"🌱",label:"Yeni Başlayan"}}function L(e,t){return t!=null&&t.startsWith("ozel_")?{label:"Özel Rozet (Müdür)",pctLeft:0}:e>=95?{label:"Maksimum Seviye",pctLeft:0}:e>=85?{label:"Süper Efsane",pctLeft:95-e}:e>=75?{label:"Efsane",pctLeft:85-e}:e>=65?{label:"Elmas",pctLeft:75-e}:e>=50?{label:"Altın",pctLeft:65-e}:e>=30?{label:"Gümüş",pctLeft:50-e}:{label:"Bronz",pctLeft:30-e}}function R(e,t){const a=document.getElementById("leaderboard");a.innerHTML="";const o={"Tuba Bozaklı":"av-t","Elif Yıldırım":"av-e","Melda Yılmaz":"av-m","Ceren Erdem":"av-c"};e.forEach((i,s)=>{const r=s+1,d=i.cashier_id===t,n=i.cashier_name?i.cashier_name.split(" ").map(g=>g[0]).join(""):"??",c=i.performance_pct??0,u=c>=85?"var(--green)":c>=65?"var(--orange)":"var(--txt2)",y=document.createElement("div");y.className="leaderboard-item"+(d?" current":""),y.innerHTML=`
                    <div class="rank rank-${r}">#${r}</div>
                    <div class="leaderboard-avatar ${o[i.cashier_name]||"av-t"}">${n}</div>
                    <div class="leaderboard-info">
                        <div class="leaderboard-name">${i.cashier_name||"Bilinmiyor"}${d?" (Sen)":""}</div>
                        <div class="leaderboard-stats">
                            ${i.total_entries||0} giriş
                            · ${i.on_time_entries||0} zamanında
                        </div>
                    </div>
                    <div class="leaderboard-points" style="color:${u}">%${c}</div>
                `,a.appendChild(y)})}function F(e){const t=document.getElementById("historyBody");if(t.innerHTML="",e.length===0){t.innerHTML='<tr><td colspan="5" style="text-align: center; color: var(--txt2); padding: 40px">Henüz giriş kaydı yok</td></tr>';return}e.forEach(a=>{const o=document.createElement("tr"),i=new Date(a.entry_time),s=i.toLocaleDateString("tr-TR",{day:"2-digit",month:"short",year:"numeric",timeZone:"Europe/Istanbul"}),r=i.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"}),d=a.shift==="sabah"?"Sabah":"Akşam",n=a.shift==="sabah"?"shift-sabah":"shift-aksam",c=a.is_on_time?"✅":"⚠️",u=a.is_on_time?"Zamanında":"Geç",y=a.is_on_time?"status-ontime":"status-late";o.innerHTML=`
                    <td>
                        <div style="font-weight: 600">${s}</div>
                        <div style="font-size: 12px; color: var(--txt2)">${r}</div>
                    </td>
                    <td><span class="shift-badge ${n}">${d}</span></td>
                    <td><span class="status-badge ${y}">${c} ${u}</span></td>
                    <td class="mono">${h(a.revenue_amount||0)}</td>
                    <td class="mono" style="color: var(--gold)">+${a.points_earned||0}</td>
                `,t.appendChild(o)})}function h(e){return new Intl.NumberFormat("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(e)+"₺"}function x(e){const t=document.getElementById("error");t.textContent="❌ "+e,t.style.display="block"}function B(e,t="success"){const a=document.createElement("div");a.style.cssText=`
                position:fixed;top:20px;right:20px;padding:14px 20px;border-radius:10px;
                font-weight:600;font-size:14px;z-index:9999;
                background:${t==="success"?"#064e3b":"#7f1d1d"};
                color:${t==="success"?"#6ee7b7":"#fca5a5"};
                border:1px solid ${t==="success"?"#065f46":"#991b1b"};
                box-shadow:0 8px 25px rgba(0,0,0,.3);
            `,a.textContent=e,document.body.appendChild(a),setTimeout(()=>a.remove(),3e3)}function A(e){return new Date(e+"T00:00:00").toLocaleDateString("tr-TR",{day:"2-digit",month:"2-digit"})}async function _(e){try{const t=b(new Date),a=new Date;a.setDate(a.getDate()-7);const o=b(a),{data:i,error:s}=await f.from("daily_reports").select("*").eq("cashier_id",e).gte("date",o).order("date",{ascending:!1}).order("entry_time",{ascending:!1});if(s)throw s;const r=i.filter(n=>n.date===t),d=i.filter(n=>n.date!==t);G(r,d)}catch(t){console.error("Girişleri çekme hatası:",t)}}function G(e,t){const a=document.getElementById("todayEntriesContainer"),o=document.getElementById("pastEntriesContainer");a.innerHTML=e.length===0?`<div style="text-align:center;padding:20px;color:var(--txt2);">
                       <div style="font-size:48px;margin-bottom:8px;">📭</div>
                       <div>Bugün henüz giriş yapmadınız</div>
                   </div>`:e.map(i=>E(i,!0)).join(""),o.innerHTML=t.length===0?`<div style="text-align:center;padding:20px;color:var(--txt2);">
                       <div style="font-size:48px;margin-bottom:8px;">📂</div>
                       <div>Geçmiş giriş bulunamadı</div>
                   </div>`:t.map(i=>E(i,!1)).join("")}function E(e,t){const a={restoran:"🍽️ Restoran",cafetarya:"☕ Cafetarya"}[e.kasa]||e.kasa,o={sabah:"🌅 Sabah",aksam:"🌙 Akşam",ogle:"🌙 Öğle"}[e.shift]||e.shift,i=parseFloat(e.individual_revenue)||(parseFloat(e.rumeli_z1)||0)+(parseFloat(e.rumeli_z2)||0)+(parseFloat(e.balik_ekmek)||0)+(parseFloat(e.dondurma)||0),s=new Date(e.entry_time).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Istanbul"}),r=t?`<div class="entry-actions">
                       <button class="entry-btn edit"   onclick="editMyEntry('${e.id}')">✏️ Düzenle</button>
                       <button class="entry-btn delete" onclick="deleteMyEntry('${e.id}')">🗑️ Sil</button>
                   </div>`:`<div style="text-align:center;font-size:11px;color:var(--txt3);padding:8px;">
                       Geçmiş girişler düzenlenemez
                   </div>`;return`
                <div class="entry-card" data-entry-id="${e.id}">
                    <div class="entry-header">
                        <div>
                            <div style="font-weight:700;margin-bottom:4px;">${A(e.date)}</div>
                            <div class="entry-time">⏰ ${s}</div>
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
                            <div class="entry-detail-value">${o}</div>
                        </div>
                        <div class="entry-detail">
                            <div class="entry-detail-label">Vardiya Cirosu</div>
                            <div class="entry-detail-value">${h(i)}</div>
                        </div>
                        <div class="entry-detail">
                            <div class="entry-detail-label">Puan</div>
                            <div class="entry-detail-value" style="color:var(--orange);">+${e.points_earned}</div>
                        </div>
                    </div>
                    ${r}
                </div>`}window.editMyEntry=async function(e){try{const{data:t,error:a}=await f.from("daily_reports").select("*").eq("id",e).single();if(a)throw a;const o=[{id:"editRumeliZ1",db:"rumeli_z1",label:"Rumeli Z1 (Cafetarya)"},{id:"editRumeliZ2",db:"rumeli_z2",label:"Rumeli Z2 (Restoran)"},{id:"editBalikEkmek",db:"balik_ekmek",label:"Balık Ekmek"},{id:"editDondurma",db:"dondurma",label:"Dondurma"}].filter(n=>t[n.db]!==null&&t[n.db]!==0),i={gida:"Gıda",kahvalti:"Kahvaltı",kahve:"Kahve",meyvesuyu:"Meyve Suyu",sicak_icecek:"Sıcak İçecek",soguk_icecek:"Soğuk İçecek",tatli:"Tatlı",salata:"Salata",dondurma_kategori:"Dondurma (Kategori)"},s=Object.keys(i).filter(n=>t[n]!==null&&t[n]!==0).map(n=>({id:"editCat_"+n,db:n,label:i[n]})),r=n=>n.map(c=>`
                    <div class="edit-field">
                        <label>${c.label}</label>
                        <input type="number" id="${c.id}" value="${t[c.db]}" step="0.01">
                    </div>`).join(""),d=document.createElement("div");d.className="edit-modal-overlay",d.innerHTML=`
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
                            ${o.length>0?`
                            <div class="edit-section">
                                <h3>💰 Z Raporu Değerleri</h3>
                                <div class="edit-grid">${r(o)}</div>
                            </div>`:""}
                            ${s.length>0?`
                            <div class="edit-section">
                                <h3>🍽️ Kategori Satışları</h3>
                                <div class="edit-grid">${r(s)}</div>
                            </div>`:""}
                        </div>
                        <div class="edit-modal-actions">
                            <button onclick="this.closest('.edit-modal-overlay').remove()" class="modal-btn cancel">İptal</button>
                            <button onclick="confirmEditMyEntry('${e}')" class="modal-btn save">💾 Kaydet</button>
                        </div>
                    </div>`,document.body.appendChild(d)}catch(t){console.error("Düzenleme modal hatası:",t),alert("❌ Giriş yüklenemedi: "+t.message)}};window.confirmEditMyEntry=async function(e){var t,a,o,i,s,r,d,n,c;try{const u={rumeliZ1:parseFloat((t=document.getElementById("editRumeliZ1"))==null?void 0:t.value)||0,balikEkmek:parseFloat((a=document.getElementById("editBalikEkmek"))==null?void 0:a.value)||0,dondurmaZ:parseFloat((o=document.getElementById("editDondurma"))==null?void 0:o.value)||0,kahve:parseFloat((i=document.getElementById("editCat_kahve"))==null?void 0:i.value)||0,meyveSuyu:parseFloat((s=document.getElementById("editCat_meyvesuyu"))==null?void 0:s.value)||0,sicakIcecek:parseFloat((r=document.getElementById("editCat_sicak_icecek"))==null?void 0:r.value)||0,sogukIcecek:parseFloat((d=document.getElementById("editCat_soguk_icecek"))==null?void 0:d.value)||0,tatli:parseFloat((n=document.getElementById("editCat_tatli"))==null?void 0:n.value)||0,notlar:((c=document.getElementById("editCat_notlar"))==null?void 0:c.value)||""},{data:y,error:g}=await C(e,u,v);if(g)throw g;document.querySelector(".edit-modal-overlay").remove(),B(`✅ Güncellendi! -5 puan cezası uygulandı. Yeni puan: ${y.points_earned}`,"success"),await _(v),setTimeout(()=>location.reload(),2500)}catch(u){console.error("Güncelleme hatası:",u),alert("❌ Güncelleme başarısız: "+u.message)}};window.deleteMyEntry=async function(e){if(confirm(`⚠️ Bu girişi silmek istediğinize emin misiniz?

Bu işlem geri alınamaz!`))try{const{error:t}=await f.from("daily_reports").delete().eq("id",e);if(t)throw t;B("✅ Giriş silindi!","success"),await _(v)}catch(t){console.error("Silme hatası:",t),alert("❌ Silme başarısız: "+t.message)}};window.showScoringInfo=function(){document.getElementById("scoringInfoModal").style.display="flex"};window.closeScoringInfo=function(){document.getElementById("scoringInfoModal").style.display="none"};
