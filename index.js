// ─── Supabase setup ───────────────────────────────────────────────────────────
const supabaseUrl = "https://gqyhkccupbeudenvsdsf.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxeWhrY2N1cGJldWRlbnZzZHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MDgyMjgsImV4cCI6MjA5MTA4NDIyOH0.C6dtGH1277KKiMBpXtWSxRY9JQrfbbo7eYKIgomoap8";
const client = supabase.createClient(supabaseUrl, supabaseKey);


const RESET_REDIRECT = `${window.location.origin}/eHealth-Hub/reseting2.html`;


function setMessage(text, color = "green") {
    const el = document.getElementById("forgotPasswordMessage");
    if (!el) return;
    el.textContent = text;
    el.style.color = color;
}


function el(id) {
    return document.getElementById(id);
}

function doctorlogout() {
    const btn = el("logoutBtn");
    
    if (!btn) return;

    btn.addEventListener("click", async () => {
        const { error } = await client.auth.signOut();
        if (error) {
            console.error("Error logging out:", error.message);
            setMessage("Error logging out", "red");
            return;
        }
        setMessage("Logout successful", "green");
        window.location.href = "doctorLogin.html";
    });
}


function forgotPassword() {
    const form = el("forgotForm");
    
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = el("email").value.trim();
        if (!email) { setMessage("Please enter your email.", "red"); return; }

        setMessage("Sending reset link...", "#555");

        const { error } = await client.auth.resetPasswordForEmail(email, {
            redirectTo: RESET_REDIRECT  
        });

        if (error) {
            console.error(error.message);
            setMessage("Error sending reset link: " + error.message, "red");
            return;
        }

        setMessage("Reset link sent! Check your email.", "green");
    });
}

function resetPassword() {
    const form = el("resetForm");
    
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const newPassword     = el("newPassword").value;
        const confirmPassword = el("confirmPassword").value;

        if (!newPassword || newPassword.length < 6) {
            setMessage("Password must be at least 6 characters.", "red");
            return;
        }

        if (newPassword !== confirmPassword) {
            setMessage("Passwords do not match.", "red");
            return;
        }

        setMessage("Updating password...", "#555");

        const { error } = await client.auth.updateUser({ password: newPassword });

        if (error) {
            console.error(error.message);
            setMessage("Error updating password: " + error.message, "red");
            return;
        }

        setMessage("Password updated successfully!", "green");
        setTimeout(() => window.location.href = "patientsLogin.html", 1500);
    });
}

async function sendOTP() {
    const emailEl = el("email");
    const otpBox  = document.querySelector(".otp-verify");

    if (!emailEl) return;

    const email = emailEl.value.trim();
    if (!email) { setMessage("Enter your email first.", "red"); return; }

    setMessage("Sending OTP...", "#555");

    const { error } = await client.auth.signInWithOtp({ email });

    if (error) {
        console.error("OTP error:", error.message);
        setMessage("Error sending OTP: " + error.message, "red");
    } else {
        setMessage("OTP sent to your email.", "green");
        if (otpBox) otpBox.style.display = "flex";
    }
}


function initOtpVerify() {
    const otpBtn = el("otp-btn");
    if (!otpBtn) return; 

    otpBtn.addEventListener("click", async () => {
        const email = el("email")?.value.trim();
        const token = el("otp_inp")?.value.trim();

        if (!email || !token) {
            setMessage("Enter both email and OTP.", "red");
            return;
        }

        const { error } = await client.auth.verifyOtp({
            email,
            token,
            type: "email"
        });

        if (error) {
            console.error(error.message);
            setMessage("Invalid OTP. Please try again.", "red");
        } else {
            setMessage("OTP verified!", "green");
            
            setTimeout(() => window.location.href = "reseting2.html", 1000);
        }
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// DOCTOR LOCATION UPDATE
// FIX 6: was never called — now attached to button click
// ═════════════════════════════════════════════════════════════════════════════
function initLocationUpdate() {
    const btn = el("updateLocationBtn");
    if (!btn) return; // only runs on pages that have this button

    btn.addEventListener("click", updateDoctorLocation);
}

async function updateDoctorLocation() {
    const locationInput    = el("location")?.value.trim();
    const practice_number  = el("practice_number")?.value.trim();

    if (!locationInput) { alert("Please enter a location."); return; }
    if (!practice_number) { alert("Practice number is required."); return; }

    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationInput)}`
        );
        const data = await response.json();

        if (!data || data.length === 0) { alert("Location not found."); return; }

        const { lat, lon } = data[0];

        const { error } = await client
            .from("doctors")
            .update({
                location: locationInput,
                lat:      parseFloat(lat),
                lng:      parseFloat(lon)
            })
            .eq("practice_number", practice_number);

        if (error) {
            console.error(error);
            alert("Error updating location.");
        } else {
            alert("Location updated successfully.");
        }
    } catch (err) {
        console.error(err);
        alert("Network error. Please try again.");
    }
}


document.addEventListener("DOMContentLoaded", () => {
    doctorlogout();
    forgotPassword();
    resetPassword();
    initOtpVerify();
    initLocationUpdate();
});