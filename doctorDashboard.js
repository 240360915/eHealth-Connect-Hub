
const supabaseUrl = "https://gqyhkccupbeudenvsdsf.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxeWhrY2N1cGJldWRlbnZzZHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MDgyMjgsImV4cCI6MjA5MTA4NDIyOH0.C6dtGH1277KKiMBpXtWSxRY9JQrfbbo7eYKIgomoap8";
const client = supabase.createClient(supabaseUrl, supabaseKey);
const ICE_SERVERS = {iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}]};

// ── State ──────────────────────────────────────────────────────────────────
let DOCTOR_ID = null, DOCTOR_NAME = "";
let allPatients = [], allAppointments = [], currentPatientId = null;
let messageChannel = null, incomingChannel = null, activeChannel = null;
let localStream = null, peerConnection = null;
let currentCallId = null, isOutgoing = false;
let isMuted = false, isCamOff = false;
let callTimerInterval = null, callSeconds = 0;
let locationInterval = null, isSharingLocation = false;
let generatedSlots = [], existingSlots = {}; // time -> {id, is_booked, open}

// ── Helpers ────────────────────────────────────────────────────────────────
const el = id => document.getElementById(id);
function safeSet(id,p,v){const n=el(id);if(n)n[p]=v;}
function showToast(msg,type=""){
  const t=el("toast");t.textContent=msg;t.className="show "+(type||"");
  setTimeout(()=>{t.className="";},3000);
}
function fmt12(hhmm){
  const [h,m]=hhmm.split(":").map(Number);
  const ap=h>=12?"PM":"AM";const hh=h%12||12;
  return `${hh}:${String(m).padStart(2,"0")} ${ap}`;
}
function fmtDate(d){return new Date(d+"T00:00").toLocaleDateString("en-ZA",{weekday:"short",day:"numeric",month:"short",year:"numeric"});}

// ── Pages ──────────────────────────────────────────────────────────────────
const pageTitles = {dashboard:"Dashboard",appointments:"Appointments",messages:"Messages",slots:"My Time Slots",location:"Location Sharing"};
function showPage(name){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("active"));
  el("page-"+name).classList.add("active");
  document.querySelector(`[data-page="${name}"]`).classList.add("active");
  safeSet("pageTitle","textContent",pageTitles[name]||name);
  if(name==="appointments") loadAllAppointments();
  if(name==="messages")     loadAllPatients();
  if(name==="slots")        initSlotDate();
}

// ── Auth & profile ─────────────────────────────────────────────────────────
async function loadProfile(){
  const {data:{user}} = await client.auth.getUser();
  if(!user){window.location.href="doctorLogin.html";return;}
  DOCTOR_ID = user.id;
  const {data} = await client.from("doctors").select("*").eq("id",user.id).single();
  if(!data) return;
  DOCTOR_NAME = `Dr. ${data.name} ${data.surname}`;
  safeSet("sidebarName","textContent",DOCTOR_NAME);
  safeSet("sidebarDisc","textContent",data.discipline||"General Practitioner");
  if(data.profile_image_url){
    const a = el("sidebarAvatar");
    a.innerHTML=`<img src="${data.profile_image_url}" class="doc-avatar" style="width:40px;height:40px;">`;
  }
}

async function logout(){
  await client.auth.signOut();
  window.location.href="doctorLogin.html";
}

// ── Dashboard ──────────────────────────────────────────────────────────────
async function loadDashboard(){
  const today = new Date().toISOString().split("T")[0];
  const [{data:appts},{data:msgs}] = await Promise.all([
    client.from("appointments").select("*").eq("doctor_id",DOCTOR_ID).eq("date",today),
    client.from("messages").select("id").eq("doctor_id",DOCTOR_ID).eq("sender","patient")
  ]);

  safeSet("statToday","textContent",(appts||[]).length);
  safeSet("statMessages","textContent",(msgs||[]).length);

  // Today table
  const table = el("todayTable");
  if(!appts||appts.length===0){table.innerHTML=`<tr><td colspan="5" class="empty-state">No appointments today.</td></tr>`;return;}
  table.innerHTML = "";
  appts.sort((a,b)=>a.time.localeCompare(b.time)).forEach(a=>{
    table.innerHTML += `<tr>
      <td>${fmt12(a.time.slice(0,5))}</td>
      <td>${a.patient_name}</td>
      <td>${a.reason}</td>
      <td><span class="badge ${a.status}">${a.status}</span></td>
      <td style="display:flex;gap:6px;align-items:center;">
        ${a.status==="pending"?`<button class="btn btn-primary btn-sm" onclick="updateApptStatus('${a.id}','confirmed')">Confirm</button>`:""}
      </td>
    </tr>`;
  });

  // Total patients (unique patient_ids from all appointments)
  const {data:allA} = await client.from("appointments").select("patient_id").eq("doctor_id",DOCTOR_ID);
  const unique = new Set((allA||[]).map(a=>a.patient_id));
  safeSet("statPatients","textContent",unique.size);
}

// ── All appointments ───────────────────────────────────────────────────────
async function loadAllAppointments(){
  const {data} = await client.from("appointments").select("*").eq("doctor_id",DOCTOR_ID).order("date",{ascending:false}).order("time");
  allAppointments = data||[];
  renderAppointments(allAppointments);
  const pending = allAppointments.filter(a=>a.status==="pending").length;
  const b = el("apptBadge");
  if(b){b.textContent=pending;b.className=pending>0?"nav-badge show":"nav-badge";}
}

function renderAppointments(list){
  const t = el("allApptsTable");
  if(!list||list.length===0){t.innerHTML=`<tr><td colspan="6" class="empty-state">No appointments.</td></tr>`;return;}
  t.innerHTML="";
  list.forEach(a=>{
    t.innerHTML+=`<tr>
      <td>${fmtDate(a.date)}</td>
      <td>${fmt12(a.time.slice(0,5))}</td>
      <td>${a.patient_name}</td>
      <td>${a.reason}</td>
      <td><span class="badge ${a.status}">${a.status}</span></td>
      <td style="display:flex;gap:6px;align-items:center;">
        ${a.status==="pending"?`<button class="btn btn-primary btn-sm" onclick="updateApptStatus('${a.id}','confirmed')">✓ Confirm</button><button class="btn btn-danger btn-sm" onclick="updateApptStatus('${a.id}','cancelled')">✕</button>`:""}
        <button class="call-mini-btn" onclick="callPatientById('${a.patient_id}','${a.patient_name}')" title="Call patient">📞</button>
      </td>
    </tr>`;
  });
}

function filterAppts(status,btn){
  document.querySelectorAll(".filter-btn").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  renderAppointments(status==="all"?allAppointments:allAppointments.filter(a=>a.status===status));
}

async function updateApptStatus(id,status){
  await client.from("appointments").update({status}).eq("id",id);
  showToast(`Appointment ${status}`, status==="confirmed"?"success":"warn");
  loadAllAppointments();
  loadDashboard();
}

// ── Messaging ──────────────────────────────────────────────────────────────
async function loadAllPatients(){
  // Load all patients who have ever messaged or had an appointment with this doctor
  const [{data:apptPats},{data:msgPats}] = await Promise.all([
    client.from("appointments").select("patient_id,patient_name").eq("doctor_id",DOCTOR_ID),
    client.from("messages").select("patient_id").eq("doctor_id",DOCTOR_ID)
  ]);

  const idSet = new Set();
  const combined = [];
  [...(apptPats||[]),...(msgPats||[])].forEach(r=>{
    if(!r.patient_id||idSet.has(r.patient_id)) return;
    idSet.add(r.patient_id);
    combined.push(r);
  });

  // Fetch full patient records for unique ids
  if(idSet.size===0){
    el("patientListEl").innerHTML=`<div class="empty-state" style="padding:20px;">No patients yet.</div>`;
    return;
  }

  const {data:pats} = await client.from("patients").select("id,name,surname,user_id").in("user_id",[...idSet]);
  allPatients = pats||[];
  // Merge in appointment names for patients not in patients table
  combined.forEach(r=>{
    if(!allPatients.find(p=>p.user_id===r.patient_id) && r.patient_name){
      allPatients.push({id:r.patient_id,user_id:r.patient_id,name:r.patient_name,surname:""});
    }
  });

  renderPatientList(allPatients);
}

function renderPatientList(list){
  const container = el("patientListEl");
  container.innerHTML="";
  if(!list||list.length===0){container.innerHTML=`<div class="empty-state" style="padding:20px;">No patients found.</div>`;return;}
  list.forEach(p=>{
    const fullName = `${p.name} ${p.surname}`.trim();
    const div = document.createElement("div");
    div.className = `patient-item${currentPatientId===p.user_id?" active":""}`;
    div.innerHTML=`
      <div class="patient-item-avatar">👤</div>
      <div style="min-width:0;">
        <div class="patient-item-name">${fullName}</div>
        <div class="patient-item-preview">Click to chat</div>
      </div>`;
    div.onclick=()=>selectPatient(p);
    container.appendChild(div);
  });
}

function filterPatients(q){
  const filtered = q ? allPatients.filter(p=>`${p.name} ${p.surname}`.toLowerCase().includes(q.toLowerCase())) : allPatients;
  renderPatientList(filtered);
}

async function selectPatient(patient){
  currentPatientId = patient.user_id||patient.id;
  const fullName = `${patient.name} ${patient.surname}`.trim();
  safeSet("chatPatientName","textContent",fullName);
  safeSet("chatPatientStatus","textContent","");
  el("chatCallBtn").style.display="flex";
  el("chatVideoBtn").style.display="flex";
  safeSet("callPatientNameLabel","textContent",fullName);
  renderPatientList(allPatients);
  await loadMessages();
  subscribeMessages();
  // Update unread badge
  const unread = await countUnread();
  const b = el("msgBadge");
  if(b){b.textContent=unread;b.className=unread>0?"nav-badge show":"nav-badge";}
}

async function loadMessages(){
  if(!currentPatientId) return;
  const {data} = await client.from("messages").select("*")
    .eq("doctor_id",DOCTOR_ID).eq("patient_id",currentPatientId)
    .order("created_at",{ascending:true});
  renderMessages(data||[]);
}

function renderMessages(msgs){
  const area = el("messagesArea");
  area.innerHTML="";
  if(!msgs.length){
    area.innerHTML=`<div class="chat-empty"><div class="empty-icon">💬</div><span>No messages yet. Say hello!</span></div>`;
    return;
  }
  msgs.forEach(m=>{
    const mine = m.sender==="doctor";
    const wrap = document.createElement("div");
    wrap.className=`msg-bubble-wrap${mine?" mine":""}`;
    wrap.innerHTML=`<div class="msg-bubble ${mine?"mine":"theirs"}">
      <div>${m.message}</div>
      <div class="msg-time">${new Date(m.created_at).toLocaleTimeString("en-ZA",{hour:"2-digit",minute:"2-digit"})}</div>
    </div>`;
    area.appendChild(wrap);
  });
  area.scrollTop=area.scrollHeight;
}

function subscribeMessages(){
  if(messageChannel){client.removeChannel(messageChannel);}
  messageChannel = client.channel(`doc-msg-${DOCTOR_ID}-${currentPatientId}`)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`doctor_id=eq.${DOCTOR_ID}`},
      ()=>loadMessages()).subscribe();
}

async function sendMsg(){
  const text = el("msgInput")?.value?.trim();
  if(!text) return;
  if(!currentPatientId){showToast("Select a patient first","warn");return;}
  const {error} = await client.from("messages").insert([{
    doctor_id:DOCTOR_ID, patient_id:currentPatientId, sender:"doctor", message:text
  }]);
  if(error){showToast(error.message,"error");return;}
  safeSet("msgInput","value","");
  loadMessages();
}

function msgKeydown(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMsg();}}

async function countUnread(){
  const {data} = await client.from("messages").select("id").eq("doctor_id",DOCTOR_ID).eq("sender","patient");
  return (data||[]).length;
}

// ── TIME SLOTS ─────────────────────────────────────────────────────────────
function initSlotDate(){
  const today = new Date().toISOString().split("T")[0];
  el("slotDate").min = today;
  if(!el("slotDate").value) el("slotDate").value = today;
  loadSlotsForDate();
}

async function loadSlotsForDate(){
  const date = el("slotDate").value;
  if(!date||!DOCTOR_ID) return;

  // Load existing slots for this date
  const {data} = await client.from("time_slots").select("*")
    .eq("doctor_id",DOCTOR_ID).eq("date",date);

  existingSlots = {};
  (data||[]).forEach(s=>{
    const t = s.time.slice(0,5);
    existingSlots[t] = {id:s.id, is_booked:s.is_booked, open:true};
  });

  if(Object.keys(existingSlots).length>0){
    // Render from existing slots
    generatedSlots = Object.keys(existingSlots).sort();
    renderSlotPills();
    el("slotSaveRow").style.display="flex";
  } else {
    el("slotsDisplay").innerHTML=`<div class="empty-state">No slots set for this date. Generate slots below.</div>`;
    el("slotSaveRow").style.display="none";
    generatedSlots=[];
  }
}

function generateSlots(){
  const from = el("slotFrom").value;
  const to   = el("slotTo").value;
  const interval = parseInt(el("slotInterval").value)||30;
  if(!from||!to){showToast("Set from/to times","warn");return;}
  if(!el("slotDate").value){showToast("Pick a date first","warn");return;}

  const [fh,fm] = from.split(":").map(Number);
  const [th,tm] = to.split(":").map(Number);
  let h=fh,m=fm;
  generatedSlots=[];

  while(h<th||(h===th&&m<tm)){
    const slot = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    generatedSlots.push(slot);
    m+=interval;
    if(m>=60){m-=60;h++;}
  }

  if(generatedSlots.length===0){showToast("No slots generated — check your times","warn");return;}
  // Mark all as open by default (preserve existing bookings)
  generatedSlots.forEach(s=>{
    if(!existingSlots[s]) existingSlots[s]={id:null,is_booked:false,open:true};
  });
  renderSlotPills();
  el("slotSaveRow").style.display="flex";
}

function renderSlotPills(){
  const grid = el("slotsDisplay");
  grid.innerHTML="";
  generatedSlots.forEach(slot=>{
    const info = existingSlots[slot]||{open:false,is_booked:false};
    const pill = document.createElement("div");
    pill.className = `slot-pill ${info.is_booked?"booked":info.open?"open":""}`;
    pill.textContent = fmt12(slot);
    pill.dataset.slot = slot;
    pill.title = info.is_booked?"Patient booked":info.open?"Click to close":"Click to open";
    if(!info.is_booked){
      pill.onclick=()=>{
        const cur = existingSlots[slot]||{open:false};
        existingSlots[slot]={...cur,open:!cur.open};
        renderSlotPills();
      };
    }
    grid.appendChild(pill);
  });
}

function openAllSlots(){
  generatedSlots.forEach(s=>{if(!existingSlots[s]?.is_booked) existingSlots[s]={...existingSlots[s],open:true};});
  renderSlotPills();
}
function closeAllSlots(){
  generatedSlots.forEach(s=>{if(!existingSlots[s]?.is_booked) existingSlots[s]={...existingSlots[s],open:false};});
  renderSlotPills();
}

async function saveSlots(){
  const date = el("slotDate").value;
  if(!date){showToast("No date selected","warn");return;}

  // Delete all non-booked existing slots for this date, then re-insert open ones
  await client.from("time_slots").delete()
    .eq("doctor_id",DOCTOR_ID).eq("date",date).eq("is_booked",false);

  const toInsert = generatedSlots
    .filter(s=>existingSlots[s]?.open && !existingSlots[s]?.is_booked)
    .map(s=>({doctor_id:DOCTOR_ID,date,time:s,is_booked:false}));

  if(toInsert.length>0){
    const {error} = await client.from("time_slots").insert(toInsert);
    if(error){showToast("Error saving slots: "+error.message,"error");return;}
  }

  showToast(`✅ Saved ${toInsert.length} open slots for ${fmtDate(date)}`,"success");
  loadSlotsForDate();
}

// ── VIDEO CALLS ────────────────────────────────────────────────────────────
function listenForIncomingCalls(){
  incomingChannel = client.channel(`incoming-doc-${DOCTOR_ID}`)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"calls",filter:`doctor_id=eq.${DOCTOR_ID}`},
      async payload=>{
        const call = payload.new;
        if(currentCallId||call.status!=="calling") return;
        currentCallId = call.id;
        isOutgoing = false;

        // Get patient name
        const {data:pat} = await client.from("patients").select("name,surname").eq("user_id",call.patient_id).maybeSingle();
        const pname = pat ? `${pat.name} ${pat.surname}` : "A patient";
        safeSet("incomingCallerName","textContent",pname);
        el("incomingOverlay").classList.add("show");
        // Play ringtone if possible
        playRingtone(true);
      }).subscribe();
}

// Outgoing call (doctor → patient)
async function initiateCall(){
  if(!currentPatientId){showToast("Select a patient first","warn");return;}
  const pname = el("chatPatientName")?.textContent||"Patient";
  callPatientById(currentPatientId, pname);
}

async function callPatientById(patientUserId, patientName){
  if(currentCallId){showToast("Already in a call","warn");return;}
  isOutgoing = true;
  currentPatientId = patientUserId;
  safeSet("outgoingPatientName","textContent",patientName);
  safeSet("callPatientNameLabel","textContent",patientName);
  el("outgoingOverlay").classList.add("show");

  try{
    localStream = await navigator.mediaDevices.getUserMedia({video:true,audio:true});
    el("localVideo").srcObject = localStream;
    peerConnection = new RTCPeerConnection(ICE_SERVERS);
    localStream.getTracks().forEach(t=>peerConnection.addTrack(t,localStream));
    peerConnection.ontrack = e=>{el("remoteVideo").srcObject=e.streams[0];setCallQuality("🟢 Connected");};

    const iceCandidates=[];
    peerConnection.onicecandidate = e=>{if(e.candidate)iceCandidates.push(e.candidate);};

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await waitForIce(peerConnection);

    const {data:callData,error} = await client.from("calls").insert([{
      patient_id:patientUserId, doctor_id:DOCTOR_ID,
      offer:JSON.stringify(offer), caller_ice:JSON.stringify(iceCandidates),
      status:"calling", initiated_by:"doctor"
    }]).select().single();

    if(error){showToast("Failed to start call","error");cleanupCall();return;}
    currentCallId = callData.id;
    subscribeActiveCall(currentCallId);

  }catch(err){
    console.error(err);showToast("Camera/mic error","error");
    el("outgoingOverlay").classList.remove("show");
    cleanupCall();
  }
}

async function acceptCall(){
  if(!currentCallId) return;
  playRingtone(false);
  el("incomingOverlay").classList.remove("show");
  setCallQuality("⏳ Connecting...");

  try{
    const {data:callData} = await client.from("calls").select("*").eq("id",currentCallId).single();
    if(!callData?.offer){showToast("Call data missing","error");cleanupCall();return;}

    localStream = await navigator.mediaDevices.getUserMedia({video:true,audio:true});
    el("localVideo").srcObject = localStream;
    peerConnection = new RTCPeerConnection(ICE_SERVERS);
    localStream.getTracks().forEach(t=>peerConnection.addTrack(t,localStream));
    peerConnection.ontrack = e=>{el("remoteVideo").srcObject=e.streams[0];setCallQuality("🟢 Connected");};

    const iceCandidates=[];
    peerConnection.onicecandidate = e=>{if(e.candidate)iceCandidates.push(e.candidate);};

    await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(callData.offer)));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await waitForIce(peerConnection);

    await client.from("calls").update({
      answer:JSON.stringify(answer),
      callee_ice:JSON.stringify(iceCandidates),
      status:"connected"
    }).eq("id",currentCallId);

    if(callData.caller_ice)
      for(const c of JSON.parse(callData.caller_ice))
        await peerConnection.addIceCandidate(new RTCIceCandidate(c));

    // Get patient name for label
    const {data:pat} = await client.from("patients").select("name,surname").eq("user_id",callData.patient_id).maybeSingle();
    if(pat) safeSet("callPatientNameLabel","textContent",`${pat.name} ${pat.surname}`);

    showActiveCall();
    subscribeActiveCall(currentCallId);

  }catch(err){
    console.error(err);showToast("Connection error","error");
    await rejectCall();
  }
}

async function rejectCall(){
  playRingtone(false);
  if(currentCallId) await client.from("calls").update({status:"rejected"}).eq("id",currentCallId);
  el("incomingOverlay").classList.remove("show");
  cleanupCall();
}

async function cancelOutgoingCall(){
  if(currentCallId) await client.from("calls").update({status:"rejected"}).eq("id",currentCallId);
  el("outgoingOverlay").classList.remove("show");
  cleanupCall();
}

async function endCall(){
  if(currentCallId) await client.from("calls").update({status:"ended"}).eq("id",currentCallId);
  hideActiveCall();
  cleanupCall();
  showToast("Call ended");
}

function subscribeActiveCall(callId){
  activeChannel = client.channel(`doc-active-${callId}`)
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"calls",filter:`id=eq.${callId}`},
      async payload=>{
        const u = payload.new;
        if(isOutgoing && u.status==="connected" && u.answer){
          // Apply answer from patient
          await peerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(u.answer)));
          if(u.callee_ice)
            for(const c of JSON.parse(u.callee_ice))
              await peerConnection.addIceCandidate(new RTCIceCandidate(c));
          el("outgoingOverlay").classList.remove("show");
          showActiveCall();
          setCallQuality("🟢 Connected");
        }
        if(u.status==="rejected"){showToast("Call declined","warn");el("outgoingOverlay").classList.remove("show");cleanupCall();}
        if(u.status==="ended"){showToast("Call ended");hideActiveCall();cleanupCall();}
      }).subscribe();
}

function showActiveCall(){
  el("activeCallOverlay").classList.add("show");
  startCallTimer();
}
function hideActiveCall(){
  el("activeCallOverlay").classList.remove("show");
  stopCallTimer();
}

function cleanupCall(){
  if(activeChannel){client.removeChannel(activeChannel);activeChannel=null;}
  if(peerConnection){peerConnection.close();peerConnection=null;}
  if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;}
  el("localVideo").srcObject=null;
  el("remoteVideo").srcObject=null;
  currentCallId=null; isOutgoing=false;
  isMuted=false; isCamOff=false;
  el("muteBtn").classList.remove("active");
  el("camBtn").classList.remove("active");
}

function toggleMute(){
  if(!localStream) return;
  isMuted=!isMuted;
  localStream.getAudioTracks().forEach(t=>t.enabled=!isMuted);
  el("muteBtn").textContent = isMuted?"🔇":"🎤";
  el("muteBtn").classList.toggle("active",isMuted);
}
function toggleCam(){
  if(!localStream) return;
  isCamOff=!isCamOff;
  localStream.getVideoTracks().forEach(t=>t.enabled=!isCamOff);
  el("camBtn").textContent = isCamOff?"🚫":"📷";
  el("camBtn").classList.toggle("active",isCamOff);
}
function toggleSpeaker(){
  // Toggle speaker icon only — browser manages output
  const btn = el("speakerBtn");
  btn.textContent = btn.textContent==="🔊"?"🔈":"🔊";
}
function setCallQuality(msg){safeSet("callQuality","textContent",msg);}

function startCallTimer(){
  callSeconds=0;stopCallTimer();
  callTimerInterval=setInterval(()=>{
    callSeconds++;
    const m=Math.floor(callSeconds/60),s=callSeconds%60;
    safeSet("callTimer","textContent",`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
  },1000);
}
function stopCallTimer(){clearInterval(callTimerInterval);callTimerInterval=null;safeSet("callTimer","textContent","00:00");}

function waitForIce(pc){
  return new Promise(res=>{
    if(pc.iceGatheringState==="complete") return res();
    const t=setTimeout(res,5000);
    pc.onicegatheringstatechange=()=>{if(pc.iceGatheringState==="complete"){clearTimeout(t);res();}};
  });
}

// Ringtone
let audioCtx=null, ringtoneOscillator=null;
function playRingtone(play){
  try{
    if(!play){if(ringtoneOscillator){ringtoneOscillator.stop();ringtoneOscillator=null;}return;}
    audioCtx = audioCtx||new(window.AudioContext||window.webkitAudioContext)();
    ringtoneOscillator = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    ringtoneOscillator.connect(gain);gain.connect(audioCtx.destination);
    ringtoneOscillator.frequency.value=440;
    gain.gain.value=0.15;
    ringtoneOscillator.start();
    let on=true;
    const interval=setInterval(()=>{
      if(!ringtoneOscillator){clearInterval(interval);return;}
      gain.gain.value=on?0.15:0;on=!on;
    },500);
  }catch(e){console.log("No audio ctx");}
}

// ── Location ───────────────────────────────────────────────────────────────
async function shareLocation(){
  if(!navigator.geolocation){safeSet("locationStatus","textContent","Not supported");return;}
  navigator.geolocation.getCurrentPosition(async pos=>{
    const {error} = await client.from("doctors").update({lat:pos.coords.latitude,lng:pos.coords.longitude}).eq("id",DOCTOR_ID);
    safeSet("locationStatus","textContent",error?`Error`:`📍 Updated at ${new Date().toLocaleTimeString()}`);
  },err=>{safeSet("locationStatus","textContent","Could not get location.");},{enableHighAccuracy:true});
}
function toggleShareLocation(){
  const btn = el("locBtn");
  if(!isSharingLocation){
    isSharingLocation=true;
    btn.textContent="🔴 Stop Sharing";btn.classList.add("active");
    shareLocation();
    locationInterval=setInterval(shareLocation,10000);
  }else{
    isSharingLocation=false;clearInterval(locationInterval);locationInterval=null;
    btn.textContent="📍 Share My Location";btn.classList.remove("active");
    safeSet("locationStatus","textContent","Location sharing stopped.");
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
async function initPage(){
  await loadProfile();
  await loadDashboard();
  listenForIncomingCalls();
}

document.addEventListener("DOMContentLoaded", initPage);

