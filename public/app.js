const todoTable = document.getElementById("todoTable");
const todoForm = document.getElementById("todoForm");
const dueDateInput = document.getElementById("dueDate");
const emailSettingsForm = document.getElementById("emailSettingsForm");
const recipientEmail = document.getElementById("recipientEmail");
const alertBox = document.getElementById("alertBox");
const reportStartDate = document.getElementById("reportStartDate");
const emailOnCreate = document.getElementById("emailOnCreate");
const emailOnComplete = document.getElementById("emailOnComplete");
const editNoteModalElement = document.getElementById("editNoteModal");
const editNoteForm = document.getElementById("editNoteForm");
const editTitleText = document.getElementById("editTitleText");
const editNoteText = document.getElementById("editNoteText");
const editNoteTaskTitle = document.getElementById("editNoteTaskTitle");
const editNoteModal = new bootstrap.Modal(editNoteModalElement);
const sortTitleBtn = document.getElementById("sortTitleBtn");
const sortDueBtn = document.getElementById("sortDueBtn");
const sortCreatedBtn = document.getElementById("sortCreatedBtn");
const sortStatusBtn = document.getElementById("sortStatusBtn");
const sortTitleIndicator = document.getElementById("sortTitleIndicator");
const sortDueIndicator = document.getElementById("sortDueIndicator");
const sortCreatedIndicator = document.getElementById("sortCreatedIndicator");
const sortStatusIndicator = document.getElementById("sortStatusIndicator");
const paginationContainer = document.getElementById("paginationContainer");
const paginationInfo = document.getElementById("paginationInfo");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const footerYear = document.getElementById("footerYear");
let editingTodoId = null;
const sortState = { key: null, direction: "asc" };
const pageSize = 12;
let currentPage = 1;

const showAlert = (type, message, dismissible = true) => {
  alertBox.className = `alert alert-${type}${
    dismissible ? " alert-dismissible fade show" : ""
  }`;
  alertBox.innerHTML = "";
  const messageSpan = document.createElement("span");
  messageSpan.textContent = message;
  alertBox.appendChild(messageSpan);
  if (dismissible) {
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "btn-close";
    closeButton.setAttribute("aria-label", "Close");
    closeButton.addEventListener("click", hideAlert);
    alertBox.appendChild(closeButton);
  }
  alertBox.classList.remove("d-none");
};

const hideAlert = () => {
  alertBox.innerHTML = "";
  alertBox.className = "alert d-none";
  alertBox.classList.add("d-none");
};

const toDisplayDate = (isoDate) => {
  if (!isoDate) return "-";
  return new Date(isoDate).toLocaleString();
};

const truncateText = (value, maxLength = 35) => {
  if (!value) return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
};

const fetchTodos = async () => {
  const response = await fetch("/api/todos?status=all");
  if (!response.ok) {
    throw new Error("Failed to load tasks");
  }
  return response.json();
};

const loadRecipientEmail = async () => {
  const response = await fetch("/api/settings/email");
  if (!response.ok) {
    throw new Error("Failed to load email settings");
  }

  const data = await response.json();
  recipientEmail.value = data.email || "";
};

const saveRecipientEmail = async (email) => {
  const response = await fetch("/api/settings/email", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Failed to save email");
  }
};

const getReportDateQuery = () => {
  if (!reportStartDate.value) {
    return "";
  }
  return `startDate=${encodeURIComponent(reportStartDate.value)}`;
};

const setDefaultReportStartDate = () => {
  if (reportStartDate.value) {
    return;
  }
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  reportStartDate.value = `${year}-${month}-${day}`;
};

const setDefaultDueDate = () => {
  if (dueDateInput.value) {
    return;
  }
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  dueDateInput.value = `${year}-${month}-${day}`;
};

const setFooterYear = () => {
  footerYear.textContent = ` ${new Date().getFullYear()}`;
};

const updateSortIndicators = () => {
  sortTitleIndicator.textContent =
    sortState.key === "title"
      ? sortState.direction === "asc"
        ? "↑"
        : "↓"
      : "";
  sortDueIndicator.textContent =
    sortState.key === "due" ? (sortState.direction === "asc" ? "↑" : "↓") : "";
  sortCreatedIndicator.textContent =
    sortState.key === "created"
      ? sortState.direction === "asc"
        ? "↑"
        : "↓"
      : "";
  sortStatusIndicator.textContent =
    sortState.key === "status"
      ? sortState.direction === "asc"
        ? "↑"
        : "↓"
      : "";
};

const sortTodos = (todos) => {
  if (!sortState.key) {
    return todos;
  }

  const sorted = [...todos];
  sorted.sort((a, b) => {
    let comparison = 0;

    if (sortState.key === "title") {
      comparison = (a.title || "").localeCompare(b.title || "", undefined, {
        sensitivity: "base",
      });
    } else if (sortState.key === "due") {
      const aHasDue = Boolean(a.due_date);
      const bHasDue = Boolean(b.due_date);
      if (!aHasDue && !bHasDue) {
        comparison = 0;
      } else if (!aHasDue) {
        comparison = 1;
      } else if (!bHasDue) {
        comparison = -1;
      } else {
        comparison = (a.due_date || "").localeCompare(b.due_date || "");
      }
    } else if (sortState.key === "created") {
      comparison = (a.created_at || "").localeCompare(b.created_at || "");
    } else if (sortState.key === "status") {
      const aStatus = a.completed ? "completed" : "open";
      const bStatus = b.completed ? "completed" : "open";
      comparison = aStatus.localeCompare(bStatus);
    }

    return sortState.direction === "asc" ? comparison : -comparison;
  });

  return sorted;
};

const setSort = (key) => {
  if (sortState.key === key) {
    sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
  } else {
    sortState.key = key;
    sortState.direction = "asc";
  }
  currentPage = 1;
  updateSortIndicators();
  void renderTodos();
};

const renderPagination = (totalItems) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }

  if (totalItems <= pageSize) {
    paginationContainer.classList.add("d-none");
    return;
  }

  paginationContainer.classList.remove("d-none");
  paginationInfo.textContent = `Page ${currentPage} of ${totalPages} (${totalItems} tasks)`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
};

const renderTodos = async () => {
  const todos = sortTodos(await fetchTodos());
  todoTable.innerHTML = "";
  renderPagination(todos.length);

  if (todos.length === 0) {
    todoTable.innerHTML =
      '<tr><td colspan="5" class="text-center text-muted">No tasks yet.</td></tr>';
    paginationContainer.classList.add("d-none");
    return;
  }

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageTodos = todos.slice(startIndex, endIndex);

  pageTodos.forEach((todo) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="fw-semibold">${todo.title}</div>
        <div class="text-muted small" title="${(todo.notes || "").replace(
          /"/g,
          "&quot;"
        )}">${truncateText(todo.notes || "", 35)}</div>
      </td>
      <td>${todo.due_date || "-"}</td>
      <td>${toDisplayDate(todo.created_at)}</td>
      <td>${
        todo.completed
          ? `Completed (${toDisplayDate(todo.completed_at)})`
          : "Open"
      }</td>
      <td>
        <div class="d-flex gap-2">
          ${
            todo.completed
              ? '<button class="btn btn-sm btn-outline-warning flex-fill" data-action="reopen">Reopen</button>'
              : '<button class="btn btn-sm btn-success flex-fill" data-action="complete">Complete</button>'
          }
          <button class="btn btn-sm btn-outline-primary flex-fill" data-action="edit-note">Edit task</button>
          <button class="btn btn-sm btn-outline-danger flex-fill" data-action="delete">Delete</button>
        </div>
      </td>
    `;

    tr.querySelectorAll("button").forEach((actionBtn) => {
      actionBtn.addEventListener("click", async () => {
        try {
          let shouldRefresh = true;
          if (actionBtn.dataset.action === "complete") {
            await completeTodo(todo.id, emailOnComplete.checked);
            showAlert("success", "Task marked as completed.", true);
          } else if (actionBtn.dataset.action === "reopen") {
            await fetch(`/api/todos/${todo.id}/reopen`, { method: "PATCH" });
            showAlert("info", "Task reopened.", true);
          } else if (actionBtn.dataset.action === "edit-note") {
            editingTodoId = todo.id;
            editNoteTaskTitle.textContent = `Task: ${todo.title}`;
            editTitleText.value = todo.title || "";
            editNoteText.value = todo.notes || "";
            editNoteModal.show();
            shouldRefresh = false;
          } else if (actionBtn.dataset.action === "delete") {
            const confirmed = window.confirm(`Delete task: "${todo.title}"?`);
            if (!confirmed) {
              return;
            }
            await deleteTodo(todo.id);
            showAlert("warning", "Task deleted.", true);
          }
          if (shouldRefresh) {
            await renderTodos();
          }
        } catch (error) {
          showAlert("danger", error.message || "Task update failed");
        }
      });
    });

    todoTable.appendChild(tr);
  });
};

const createTodo = async (payload) => {
  const response = await fetch("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Failed to create task");
  }
};

const completeTodo = async (id, emailNow) => {
  const response = await fetch(`/api/todos/${id}/complete`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emailOnComplete: emailNow }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Failed to mark completed");
  }

  return response.json();
};

const deleteTodo = async (id) => {
  const response = await fetch(`/api/todos/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Failed to delete task");
  }
};

const updateTodoNote = async (id, title, notes) => {
  const response = await fetch(`/api/todos/${id}/notes`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, notes }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Failed to update note");
  }
};

editNoteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (editingTodoId === null) {
    return;
  }

  try {
    await updateTodoNote(
      editingTodoId,
      editTitleText.value,
      editNoteText.value
    );
    editNoteModal.hide();
    showAlert("success", "Task updated.", true);
    await renderTodos();
  } catch (error) {
    showAlert("danger", error.message || "Failed to update task");
  }
});

todoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideAlert();

  const payload = {
    title: document.getElementById("title").value,
    notes: document.getElementById("notes").value,
    dueDate: document.getElementById("dueDate").value,
    emailOnCreate: emailOnCreate.checked,
  };

  try {
    await createTodo(payload);
    todoForm.reset();
    setDefaultDueDate();
    showAlert("success", "Task created.", true);
    await renderTodos();
  } catch (error) {
    showAlert("danger", error.message || "Failed to create task");
  }
});

emailSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideAlert();

  try {
    await saveRecipientEmail(recipientEmail.value);
    showAlert("success", "Email was saved.", true);
  } catch (error) {
    showAlert("danger", error.message || "Failed to save email");
  }
});

document.getElementById("refreshBtn").addEventListener("click", async () => {
  hideAlert();
  try {
    await renderTodos();
  } catch (error) {
    showAlert("danger", error.message || "Failed to refresh");
  }
});

document.querySelectorAll(".download-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const period = button.dataset.period;
    const query = getReportDateQuery();
    const url = query
      ? `/api/reports/${period}/download?format=csv&${query}`
      : `/api/reports/${period}/download?format=csv`;
    window.location.href = url;
  });
});

prevPageBtn.addEventListener("click", async () => {
  if (currentPage <= 1) {
    return;
  }
  currentPage -= 1;
  await renderTodos();
});

nextPageBtn.addEventListener("click", async () => {
  currentPage += 1;
  await renderTodos();
});

renderTodos().catch((error) =>
  showAlert("danger", error.message || "Failed to initialize")
);
loadRecipientEmail().catch((error) =>
  showAlert("danger", error.message || "Failed to load email settings")
);
setDefaultReportStartDate();
setDefaultDueDate();
setFooterYear();

sortTitleBtn.addEventListener("click", () => setSort("title"));
sortDueBtn.addEventListener("click", () => setSort("due"));
sortCreatedBtn.addEventListener("click", () => setSort("created"));
sortStatusBtn.addEventListener("click", () => setSort("status"));
updateSortIndicators();
