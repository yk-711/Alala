const form = document.getElementById("resetForm");
const message = document.getElementById("resetMessage");
const token = new URLSearchParams(window.location.search).get("token");

function showMessage(text, type = "") {
  message.textContent = text;
  message.className = `message ${type}`;
}
function setLoading(button, loading) {
  button.disabled = loading;
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = "جارٍ الحفظ...";
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
  }
}
document.querySelectorAll("[data-password]").forEach(button => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.password);
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    button.textContent = visible ? "إظهار" : "إخفاء";
  });
});
if (!token) {
  showMessage("رابط الاستعادة غير صالح أو منتهي الصلاحية.", "error");
  form.querySelector("button[type=submit]").disabled = true;
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  const password = document.getElementById("newPassword").value;
  const confirm = document.getElementById("confirmNewPassword").value;
  const button = form.querySelector("button[type=submit]");
  if (!token) return showMessage("اطلب رابط استعادة جديداً.", "error");
  if (password.length < 8) return showMessage("كلمة المرور يجب أن تكون 8 أحرف على الأقل.", "error");
  if (password !== confirm) return showMessage("كلمتا المرور غير متطابقتين.", "error");
  setLoading(button, true);
  try {
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      credentials: "same-origin",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({token, password})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "تعذر حفظ كلمة المرور.");
    showMessage(data.message || "تم تحديث كلمة المرور بنجاح.", "success");
    form.reset();
    button.textContent = "تم الحفظ";
    setTimeout(() => { window.location.href = "login.html"; }, 1800);
  } catch (error) {
    showMessage(error.message || "حدث خطأ غير متوقع.", "error");
    setLoading(button, false);
  }
});
