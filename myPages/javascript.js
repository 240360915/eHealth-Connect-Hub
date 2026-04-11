            function doctorLogin(){
             document.querySelector(".doctor-form").addEventListener("submit", function(e) {
                e.preventDefault();

                let password = document.getElementById("password");
                let confirm = document.getElementById("confirm_password");
                let pattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{6,}$/;
    
                if (password.value !== confirm.value) {
                    alert("Passwords do not match ");
                    return;
                }else if(password.value){
                    return pattern.test(password.value);
                }else{
                    alert('Password does not meet minimum requirements')
                }

                const doctor = {
                    practice_number: document.getElementById("practice_number").value,
                    practice_name: document.getElementById("practice_name").value,
                    discipline: document.getElementById("discipline").value,
                    name: document.getElementById("name").value,
                    id:document.getElementById('idNumber').value,
                    surname: document.getElementById("surname").value,
                    phone: document.getElementById("phone").value,
                    email: document.getElementById("email").value,
                    password: password
                };
                


                let doctors = JSON.parse(localStorage.getItem("doctors")) || [];

                doctors.push(doctor);

                localStorage.setItem("doctors", JSON.stringify(doctors));

                alert("Registration successful");

                window.location.href = "doctorLogin.html";
            });   
            }