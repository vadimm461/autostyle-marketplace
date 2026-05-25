createUserWithEmailAndPassword(auth, email, password)
  .then((userCredential) => {
    alert("Регистрация успешна");
    window.location.href = "index.html";
  })
  .catch((error) => {

    if (error.code === "auth/email-already-in-use") {
      alert("Этот email уже зарегистрирован");
    }

    else if (error.code === "auth/weak-password") {
      alert("Пароль слишком слабый");
    }

    else {
      alert(error.message);
    }

  });
