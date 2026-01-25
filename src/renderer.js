window.addEventListener("DOMContentLoaded", async () => {
  const apiKeyInput = document.getElementById("apiKeyInput");
  const selectFolderBtn = document.getElementById("selectFolderBtn");
  const folderPathDisplay = document.getElementById("folderPath");
  const saveBtn = document.getElementById("saveBtn");
  const editBtn = document.getElementById("editBtn");
  const startBtn = document.getElementById("startBtn");
  const statusBar = document.getElementById("statusBar");
  const logBtn = document.getElementById("logBtn");
  const terminal = document.getElementById("terminal");
  const statusCircle = document.getElementById("statusCircle");

  let currentPath = null;

  function setLockedState(isLocked) {
    apiKeyInput.disabled = isLocked;
    selectFolderBtn.disabled = isLocked;

    // Toggle Buttons
    saveBtn.style.display = isLocked ? "none" : "block";
    editBtn.style.display = isLocked ? "block" : "none";

    // Enable migration only if locked (configured)
    startBtn.disabled = !isLocked;

    if (isLocked) {
      apiKeyInput.type = "password";
      statusBar.textContent = "Configuração carregada e protegida.";
    } else {
      apiKeyInput.type = "text";
      statusBar.textContent = "Editando configurações...";
      statusCircle.style.background = "gray";
    }
  }

  async function checkConnection() {
    if (apiKeyInput.disabled) {
      // Only check if we aren't in "Edit mode"
      try {
        // Assuming you have this bridge function to test DB/API
        const isOnline = await window.electronAPI.testConnection();
        statusCircle.style.background = isOnline ? "#28a745" : "#dc3545";
        statusCircle.title = isOnline
          ? "Conectado ao Servidor"
          : "Erro de Conexão";
      } catch (err) {
        statusCircle.style.background = "#dc3545";
      }
    }
  }

  setInterval(checkConnection, 100000);

  try {
    const settings = await window.electronAPI.getSettings();
    if (settings && settings.apiKey) {
      apiKeyInput.value = settings.apiKey;
      if (settings.folderPath) {
        currentPath = settings.folderPath;
        folderPathDisplay.textContent = currentPath;
        setLockedState(true);
        checkConnection(); // Check immediately on load
      }
    }
  } catch (err) {
    console.error("Erro ao carregar:", err);
  }
  // Function to toggle between locked and editable states
  // function setLockedState(isLocked) {
  //   apiKeyInput.disabled = isLocked;
  //   selectFolder.disabled = isLocked;
  //   saveBtn.style.display = isLocked ? "none" : "block";
  //   editBtn.style.display = isLocked ? "block" : "none";
  //   startBtn.disabled = !isLocked;

  //   if (isLocked) {
  //     apiKeyInput.type = "password";
  //   }
  // }

  //   const savedSettings = await window.electronAPI.getSettings();
  //   if (savedSettings.apiKey) {
  //     apiKeyInput.value = savedSettings.apiKey;
  //     if (savedSettings.folderPath) {
  //       currentPath = savedSettings.folderPath;
  //       folderPathDisplay.textContent = currentPath;
  //       setLockedState(true);
  //       checkConnection();
  //     }
  //   }

  // 1. Folder Selection
  selectFolderBtn.addEventListener("click", async () => {
    const path = await window.electronAPI.selectFolder();
    if (path) {
      currentPath = path;
      folderPathDisplay.textContent = path;
    }
  });

  // 2. Save & Validate
  saveBtn.addEventListener("click", async () => {
    const apiKeyString = apiKeyInput.value.trim();

    if (!apiKeyString || !currentPath) {
      alert("Por favor, preencha a chave e selecione a pasta.");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Salvar";

    const result = await window.electronAPI.saveSettings({
      apiKey: apiKeyString,
      folderPath: currentPath,
    });

    console.log("Saving settings:", { apiKeyString, currentPath });

    if (result.success) {
      checkConnection();
      setLockedState(true);
    } else {
      alert("Falha: " + result.message);
    }

    saveBtn.disabled = false;
  });

  // 3. Edit Mode
  editBtn.addEventListener("click", () => {
    setLockedState(false);
  });

  startBtn.addEventListener("click", async () => {
    const settings = await window.electronAPI.getSettings();
    const clientId = settings.lastClient; // Ensure this was saved during login
    const folderPath = folderPathDisplay.textContent || settings.folderPath;
    console.log("Retrieved settings for migration:", settings);
    // console.log("Starting migration with:", { folderPath, clientId });

    if (!folderPath || !clientId) {
      alert(
        "Configurações incompletas. Por favor, verifique a chave e a pasta.",
      );
      return;
    }
    terminal.innerHTML = "Iniciando migração...<br>";
    startBtn.disabled = true;

    window.electronAPI.onProgress((message) => {
      const timestamp = new Date().toLocaleTimeString();
      terminal.innerHTML += `<code>[${timestamp}]</code> ${message}<br>`;
      terminal.scrollTop = terminal.scrollHeight;

      if (
        message.includes("concluído") ||
        message.includes("Erro") ||
        message.includes("Finalizado")
      ) {
        startBtn.disabled = false;
        startBtn.textContent = "Iniciar Migração";
      }
    });

    window.electronAPI.startMigration({ folderPath, clientId });
  });

  logBtn.addEventListener("click", () => {
    window.electronAPI.openLogs();
  });
});
