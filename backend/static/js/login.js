document.addEventListener(
    "DOMContentLoaded",
    () => {

        const loginForm =
        document.getElementById("login-form");

        const signupForm =
        document.getElementById("signup-form");

        const successState =
        document.getElementById("success-state");

        const showSignup =
        document.getElementById("show-signup");

        const showLogin =
        document.getElementById("show-login");

        if(showSignup){

            showSignup.addEventListener(
                "click",
                (e) => {

                    e.preventDefault();

                    loginForm.style.display =
                    "none";

                    signupForm.style.display =
                    "block";
                }
            );
        }

        if(showLogin){

            showLogin.addEventListener(
                "click",
                (e) => {

                    e.preventDefault();

                    signupForm.style.display =
                    "none";

                    loginForm.style.display =
                    "block";
                }
            );
        }

        function getCsrfToken() {

            return document.cookie
                .split("; ")
                .find(row =>
                    row.startsWith("csrftoken=")
                )
                ?.split("=")[1];
        }

        const registerBtn =
        document.getElementById(
            "register-btn"
        );

        if(registerBtn){

            registerBtn.addEventListener(
                "click",
                async () => {

                    const data = {

                        name:
                        document.getElementById(
                            "signup-name"
                        ).value,

                        phone:
                        document.getElementById(
                            "signup-phone"
                        ).value,

                        email:
                        document.getElementById(
                            "signup-email"
                        ).value,

                        affiliation:
                        document.getElementById(
                            "signup-affiliation"
                        ).value,

                        domain:
                        document.getElementById(
                            "signup-domain"
                        ).value,

                        password:
                        document.getElementById(
                            "signup-password"
                        ).value,
                    };

                    try {

                        const res = await fetch(
                            "/api/auth/signup/",
                            {
                                method: "POST",

                                headers: {
                                    "Content-Type":
                                    "application/json",

                                    "X-CSRFToken":
                                    getCsrfToken(),
                                },

                                body:
                                JSON.stringify(data),
                            }
                        );

                        const result =
                        await res.json();

                        if(result.authenticated){

                            signupForm.style.display =
                            "none";

                            successState.style.display =
                            "flex";

                            setTimeout(() => {

                                window.location.href =
                                result.redirect;

                            }, 1000);

                        } else {

                            alert(
                                result.error
                            );
                        }

                    } catch(err){

                        console.error(err);

                        alert(
                            "Signup failed"
                        );
                    }
                }
            );
        }

        const loginBtn =
        document.getElementById(
            "signin-btn"
        );

        if(loginBtn){

            loginBtn.addEventListener(
                "click",
                async () => {

                    const data = {

                        email:
                        document.getElementById(
                            "email"
                        ).value,

                        password:
                        document.getElementById(
                            "password"
                        ).value,
                    };

                    try {

                        const res = await fetch(
                            "/api/auth/login/",
                            {
                                method: "POST",

                                headers: {
                                    "Content-Type":
                                    "application/json",

                                    "X-CSRFToken":
                                    getCsrfToken(),
                                },

                                body:
                                JSON.stringify(data),
                            }
                        );

                        const result =
                        await res.json();

                        if(result.authenticated){

                            loginForm.style.display =
                            "none";

                            successState.style.display =
                            "flex";

                            setTimeout(() => {

                                window.location.href =
                                result.redirect;

                            }, 1000);

                        } else {

                            alert(
                                result.error
                            );
                        }

                    } catch(err){

                        console.error(err);

                        alert(
                            "Login failed"
                        );
                    }
                }
            );
        }
    }
);