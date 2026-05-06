const supabaseUrl = "https://gqyhkccupbeudenvsdsf.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxeWhrY2N1cGJldWRlbnZzZHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MDgyMjgsImV4cCI6MjA5MTA4NDIyOH0.C6dtGH1277KKiMBpXtWSxRY9JQrfbbo7eYKIgomoap8";
const client = supabase.createClient(supabaseUrl, supabaseKey);


//  Helper: upload a single document to Supabase Storage
//  Returns the file path (stored in DB) or null

async function uploadDocument(file, userId, documentType) {
    if (!file) return null;

    const fileExt = file.name.split('.').pop();
    const filePath = `${userId}/${documentType}.${fileExt}`;

    const { data, error } = await client.storage
        .from('doctor-documents')
        .upload(filePath, file, { upsert: true });

    if (error) {
        alert(`Error uploading ${documentType}: ${error.message}`);
        return null;
    }

    return data.path;
}

//  Doctor Registration

function doctorRegistration() {
    const form = document.querySelector("form");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        // ── Personal & Practice fields ──
        const practice_number    = document.getElementById("practice_number").value.trim();
        const practice_name      = document.getElementById("practice_name").value.trim();
        const hpcsa_number       = document.getElementById("hpcsa_number").value.trim();
        const discipline         = document.getElementById("discipline").value.trim();
        const qualifications     = document.getElementById("qualifications").value.trim();
        const name               = document.getElementById("name").value.trim();
        const surname            = document.getElementById("surname").value.trim();
        const phone              = document.getElementById("phone").value.trim();
        const id_number          = document.getElementById("idNumber").value.trim();
        const email              = document.getElementById("email").value.trim();
        const password           = document.getElementById("password").value;
        const confirmPassword    = document.getElementById("confirmPassword").value;
        const operating_hours    = document.getElementById("operating_hours").value.trim();
        const hourly_rate = parseFloat(document.getElementById("hourly_rate").value) || 0;
        const language          = document.getElementById("language").value.trim();
        const medical_aids       = document.getElementById("medical_aids").value.trim();

        // ── Address ──
        const address_line1 = document.getElementById("address1").value.trim();
        const address_line2 = document.getElementById("address2").value.trim();
        const city          = document.getElementById("city").value.trim();
        const province      = document.getElementById("province").value.trim();
        const postal_code   = document.getElementById("postal_code").value.trim();

        // ── Gender ──
        const genderInput = document.querySelector('input[name="gender"]:checked');
        const gender = genderInput ? genderInput.value : null;

        // ── Validation ──
        if (password !== confirmPassword) {
            alert("Passwords do not match.");
            return;
        }

        if (id_number.length !== 13) {
            alert("ID Number must be exactly 13 digits.");
            return;
        }

        if (phone.length !== 10) {
            alert("Cell phone number must be exactly 10 digits.");
            return;
        }

        // ── Step 1: Create auth user ──
        const { data: authData, error: authError } = await client.auth.signUp({
            email,
            password
        });

        if (authError) {
            alert("Signup error: " + authError.message);
            return;
        }

        const user = authData.user;

        // ── Step 2: Upload profile image (public bucket) ──
        const profileImageFile = document.getElementById("profile_image").files[0];
        let profile_image_url = null;

        if (profileImageFile) {
            const { data: uploadData, error: uploadError } = await client.storage
                .from('profile-images')
                .upload(`doctors/${user.id}_${profileImageFile.name}`, profileImageFile, { upsert: true });

            if (uploadError) {
                alert("Profile image upload error: " + uploadError.message);
                return;
            }

            profile_image_url = client.storage
                .from('profile-images')
                .getPublicUrl(uploadData.path).data.publicUrl;
        }

        // ── Step 3: Upload verification documents (private bucket) ──
        const id_document_url          = await uploadDocument(document.getElementById("id_document").files[0],          user.id, "id_document");
        const hpcsa_certificate_url    = await uploadDocument(document.getElementById("hpcsa_certificate").files[0],    user.id, "hpcsa_certificate");
        const medical_degree_url       = await uploadDocument(document.getElementById("medical_degree").files[0],       user.id, "medical_degree");
        const specialist_cert_url      = await uploadDocument(document.getElementById("specialist_certificate").files[0], user.id, "specialist_certificate");
        const practice_certificate_url = await uploadDocument(document.getElementById("practice_certificate").files[0], user.id, "practice_certificate");
        const proof_of_address_url     = await uploadDocument(document.getElementById("proof_of_address").files[0],     user.id, "proof_of_address");

        // Check required documents uploaded successfully
        if (!id_document_url || !hpcsa_certificate_url || !medical_degree_url || !practice_certificate_url || !proof_of_address_url) {
            alert("One or more required documents failed to upload. Please try again.");
            return;
        }

        // ── Step 4: Insert doctor record into DB ──
        const { data, error } = await client
            .from("doctors")
            .insert([{
                id:                      user.id,
                practice_number,
                practice_name,
                hpcsa_number,
                discipline,
                qualifications,
                name,
                surname,
                phone,
                id_number,
                email,
                gender,
                operating_hours,
                hourly_rate: hourly_rate,
                language,
                medical_aids,
                profile_image_url,
                address_line1,
                address_line2,
                city,
                province,
                postal_code,
                // Document URLs
                id_document_url,
                hpcsa_certificate_url,
                medical_degree_url,
                specialist_certificate_url: specialist_cert_url,
                practice_certificate_url,
                proof_of_address_url,
                // Default verification status
                verification_status: 'pending'
            }]);

        if (error) {
            console.error("DB ERROR:", error);
            alert("Database error: " + error.message);
            return;
        }

        alert("Registration successful! Your account is pending verification by an administrator. You will be notified once approved.");
        window.location.href = "doctorLogin.html";
    });
}

doctorRegistration();



//  Doctor Login

