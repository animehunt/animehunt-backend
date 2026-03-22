// ===============================
// Upload System (ImageKit)
// ===============================

const Upload = (() => {

  const CONFIG = {
    urlEndpoint: "https://upload.imagekit.io/api/v1/files/upload",
    publicKey: "YOUR_PUBLIC_KEY", // already added by you
  };

  // ===============================
  // INTERNAL: upload to ImageKit
  // ===============================
  async function uploadToImageKit(file, retry = 2) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("fileName", Date.now() + "_" + file.name);

      const res = await fetch(CONFIG.urlEndpoint, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(CONFIG.publicKey + ":"),
        },
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();

      return {
        success: true,
        url: data.url,
        fileId: data.fileId,
      };

    } catch (err) {

      // 🔁 retry system
      if (retry > 0) {
        console.warn("Retry upload...", retry);
        return uploadToImageKit(file, retry - 1);
      }

      return {
        success: false,
        error: err.message,
      };
    }
  }

  // ===============================
  // PUBLIC: bind input file → auto upload
  // ===============================
  function bindFileInput({
    fileInput,
    urlInput,
    previewImg,
    errorBox
  }) {

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;

      // preview show
      if (previewImg) {
        previewImg.src = URL.createObjectURL(file);
        previewImg.style.display = "block";
      }

      if (errorBox) errorBox.style.display = "none";

      urlInput.value = "Uploading...";

      const res = await uploadToImageKit(file);

      if (!res.success) {
        urlInput.value = "";
        if (errorBox) errorBox.style.display = "block";
        console.error("Upload error:", res.error);
        return;
      }

      // ✅ auto set URL
      urlInput.value = res.url;
    });
  }

  // ===============================
  // PUBLIC: manual upload (API use)
  // ===============================
  async function upload(file) {
    return await uploadToImageKit(file);
  }

  return {
    bindFileInput,
    upload
  };

})();
