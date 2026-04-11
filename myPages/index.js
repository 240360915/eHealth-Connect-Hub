const supabaseUrl = "https://gqyhkccupbeudenvsdsf.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxeWhrY2N1cGJldWRlbnZzZHNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MDgyMjgsImV4cCI6MjA5MTA4NDIyOH0.C6dtGH1277KKiMBpXtWSxRY9JQrfbbo7eYKIgomoap8";
const client = supabase.createClient(supabaseUrl, supabaseKey);

function doctorRegistration(){
  document.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();

      const practice_number = document.getElementById("practice_number").value;
      const practice_name = document.getElementById("practice_name").value;
      const discipline = document.getElementById("discipline").value;
      const name = document.getElementById("name").value;
      const surname = document.getElementById("surname").value;
      const phone = document.getElementById("phone").value;
      const id_number = document.getElementById("idNumber").value;
      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;
      const confirmPassword = document.getElementById("confirmPassword").value;

      if (password !== confirmPassword) {
          alert("Passwords do not match");
          return;
      }

      const genderInput = document.querySelector('input[name="gender"]:checked');
      const gender = genderInput ? genderInput.id : null;

      
      const { data: authData, error: authError } = await client.auth.signUp({
          email: email,
          password: password
      });

      if (authError) {
          alert("Signup error: " + authError.message);
          return;
      }

      const user = authData.user;

      
      const { error: dbError } = await client
          .from("doctors")
          .insert([
              {
                  id: user.id,
                  practice_number,
                  practice_name,
                  discipline,
                  name,
                  surname,
                  phone,
                  id_number,
                  email,
                  gender
              }
          ]);

      if (dbError) {
          alert("Database error: " + dbError.message);
          return;
      }

      alert("Registered successfully");

    
      window.location.href = "doctorLogin.html";
  });
}  

function doctorLogin(){

      document.querySelector(".PatientForm").addEventListener("submit", async (e) => {
          e.preventDefault();

          const practice_number = document.getElementById("practice_number").value.trim();
          const password = document.getElementById("password").value.trim();

          if (!practice_number || !password) {
              alert("Please fill in all fields");
              return;
          }

          try {
              
              const { data, error } = await client
              .from("doctors")
              .select("email")
              .or(`practice_number.eq.${practice_number},email.eq.${practice_number}`)
              .single();

              if (error || !data) {
                  alert("Practice number not found");
                  return;
              }

              const email = data.email;

              
              const { error: loginError } = await client.auth.signInWithPassword({
                  email: email,
                  password: password
              });

              if (loginError) {
                  alert("Incorrect password");
                  return;
              }

              alert("Login successful!");
              window.location.href = "doctorDashboard.html";

          } catch (err) {
              console.error(err);
              alert("Something went wrong");
          }
      });
}

function patientsRegistration() {
      document.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();

      const name = document.getElementById("name").value;
      const surname = document.getElementById("surname").value;
      const date_of_birth = document.getElementById("date_of_birth").value;
      const id_number = document.getElementById("id_number").value;
      const title = document.getElementById("title").value;
      const phone = document.getElementById("phone").value;
      const languege = document.getElementById("languege").value;
      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;
      const confirmPassword = document.getElementById("confirmPassword").value;

      if (password !== confirmPassword) {
          alert("Passwords do not match");
          return;
      }

      const genderInput = document.querySelector('input[name="gender"]:checked');
      const gender = genderInput ? genderInput.id : null;

      
      const { data: authData, error: authError } = await client.auth.signUp({
          email: email,
          password: password
      });

      if (authError) {
          alert("Signup error: " + authError.message);
          return;
      }

      const user = authData.user;

      
      const { error: dbError } = await client
          .from("patients")
          .insert([
              {
                  id: user.id,
                  name,
                  surname,
                  date_of_birth,
                  id_number,
                  title,
                  phone,
                  languege,
                  email,
                  gender
              }
          ]);

      if (dbError) {
          alert("Database error: " + dbError.message);
          return;
      }

      alert("Registered successfully");

    
      window.location.href = "patientsLogin.html";
  });
  
}

function patientsLogin(){
  const form = document.querySelector(".PatientForm");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    console.log("Login running...");

    const input = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!input || !password) {
      alert("Please fill in all fields");
      return;
    }

    let emailToUse = "";

    try {
      if (input.includes("@")) {
        emailToUse = input;
      } else {
        const { data, error } = await client
          .from("patients")
          .select("email")
          .eq("phone", input)
          .single();

        if (error || !data) {
          alert("User not found");
          return;
        }

        emailToUse = data.email;
      }

      const { error: loginError } = await client.auth.signInWithPassword({
        email: emailToUse,
        password: password
      });

      if (loginError) {
        alert(loginError.message);
        return;
      }

      alert("Login successful!");
      window.location.href = "patientsDashboard.html";

    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  });
};
function logout(){
  document.getElementById("logoutBtn").addEventListener("click", async () => {
  const { error } = await client.auth.signOut();

  if (error) {
    alert("Error logging out");
    return;
  }

    window.location.href = "patientsLogin.html";
  });
}
function doctorlogout(){
  document.getElementById("logoutBtn").addEventListener("click", async () => {
  const { error } = await client.auth.signOut();

  if (error) {
    alert("Error logging out");
    return;
  }

    window.location.href = "doctorLogin.html";
  });
}

function forgotPassword() {
  document.getElementById("forgotForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();

    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: "http://127.0.0.1:5500/myPages/reseting2.html"
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Password reset link sent! Check your email.");
  });
}

function resetPassword(){
  document.getElementById("resetForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (newPassword !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    const { error } = await client.auth.updateUser({
      password: newPassword
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Password updated successfully!");
    window.location.href = "patientsLogin.html";
  });
}



       