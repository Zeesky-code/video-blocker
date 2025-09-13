/**
 * Options Page JavaScript for Twitter Video Blocker Extension
 * Handles settings, statistics, and blocked video management
 */

// Storage key constants
const STORAGE_KEYS = {
	SETTINGS: "vb_settings",
	BLOCKED_HASHES: "vb_blocked_hashes_v1",
	STATS: "vb_stats_v1",
};

// Default settings
const DEFAULT_SETTINGS = {
	autoScan: true,
	sensitivity: 12,
	showNotifications: true,
	logLevel: "info",
	maxRetries: 2,
};

class OptionsManager {
	constructor() {
		this.currentTab = "stats";
		this.blockedHashes = [];
		this.filteredHashes = [];
		this.settings = { ...DEFAULT_SETTINGS };
		this.stats = {
			totalBlocked: 0,
			weeklyBlocked: 0,
			dailyBlocked: 0,
			storageSize: 0,
			dailyStats: Array(7).fill(0),
		};
		this.currentPage = 1;
		this.itemsPerPage = 20;

		this.init();
	}

	async init() {
		console.log("Initializing Options Manager...");

		// Load data
		await this.loadSettings();
		await this.loadBlockedHashes();
		await this.loadStats();

		// Setup event listeners
		this.setupEventListeners();

		// Initialize UI
		this.updateUI();
		this.updateStats();
		this.renderBlockedList();
		this.drawChart();

		console.log("Options Manager initialized successfully");
	}

	setupEventListeners() {
		// Tab switching
		document.querySelectorAll(".tab-button").forEach((button) => {
			button.addEventListener("click", (e) => {
				this.switchTab(e.target.dataset.tab);
			});
		});

		Settings;
		this.setupSettingsListeners();

		// Blocked videos
		this.setupBlockedVideosListeners();

		// Modal
		this.setupModalListeners();
	}

	setupSettingsListeners() {
		// Auto scan toggle
		const autoScanCheckbox = document.getElementById("auto-scan");
		autoScanCheckbox.addEventListener("change", (e) => {
			this.settings.autoScan = e.target.checked;
			this.saveSettings();
		});

		// Sensitivity slider
		const sensitivitySlider = document.getElementById("sensitivity");
		const sensitivityValue = document.getElementById("sensitivity-value");
		sensitivitySlider.addEventListener("input", (e) => {
			const value = parseInt(e.target.value);
			this.settings.sensitivity = value;
			sensitivityValue.textContent = value;
			this.saveSettings();
		});

		// Show notifications toggle
		const notificationsCheckbox = document.getElementById("show-notifications");
		notificationsCheckbox.addEventListener("change", (e) => {
			this.settings.showNotifications = e.target.checked;
			this.saveSettings();
		});

		// Log level select
		const logLevelSelect = document.getElementById("log-level");
		logLevelSelect.addEventListener("change", (e) => {
			this.settings.logLevel = e.target.value;
			this.saveSettings();
		});

		// Max retries input
		const maxRetriesInput = document.getElementById("max-retries");
		maxRetriesInput.addEventListener("change", (e) => {
			this.settings.maxRetries = parseInt(e.target.value);
			this.saveSettings();
		});

		// Data management buttons
		document
			.getElementById("backup-btn")
			.addEventListener("click", () => this.backupData());
		document
			.getElementById("restore-btn")
			.addEventListener("click", () =>
				document.getElementById("restore-file").click(),
			);
		document
			.getElementById("restore-file")
			.addEventListener("change", (e) => this.restoreData(e));
		document
			.getElementById("reset-settings-btn")
			.addEventListener("click", () => this.resetSettings());
	}

	setupBlockedVideosListeners() {
		// Search
		const searchInput = document.getElementById("hash-search");
		searchInput.addEventListener("input", (e) => {
			this.filterHashes(e.target.value);
		});

		// Filters
		const dateFilter = document.getElementById("date-filter");
		const sortOrder = document.getElementById("sort-order");

		dateFilter.addEventListener("change", () => this.applyFilters());
		sortOrder.addEventListener("change", () => this.applyFilters());

		// Actions
		document
			.getElementById("export-btn")
			.addEventListener("click", () => this.exportBlockedList());
		document
			.getElementById("clear-all-btn")
			.addEventListener("click", () =>
				this.showConfirmModal(
					"Tüm Engellenmiş Videoları Sil",
					"Bu işlem geri alınamaz. Tüm engellenmiş video hash'lerini silmek istediğinizden emin misiniz?",
					() => this.clearAllHashes(),
				),
			);

		// Pagination
		document
			.getElementById("prev-page")
			.addEventListener("click", () => this.changePage(-1));
		document
			.getElementById("next-page")
			.addEventListener("click", () => this.changePage(1));
	}

	setupModalListeners() {
		const modal = document.getElementById("confirm-modal");
		const cancelBtn = document.getElementById("modal-cancel");
		const confirmBtn = document.getElementById("modal-confirm");

		cancelBtn.addEventListener("click", () => this.hideModal());
		confirmBtn.addEventListener("click", () => {
			if (this.pendingAction) {
				this.pendingAction();
				this.pendingAction = null;
			}
			this.hideModal();
		});

		// Close on backdrop click
		modal.addEventListener("click", (e) => {
			if (e.target === modal) {
				this.hideModal();
			}
		});
	}

	switchTab(tabName) {
		// Update active tab button
		document.querySelectorAll(".tab-button").forEach((btn) => {
			btn.classList.remove("active");
		});
		document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");

		// Update active tab content
		document.querySelectorAll(".tab-content").forEach((content) => {
			content.classList.remove("active");
		});
		document.getElementById(`${tabName}-tab`).classList.add("active");

		this.currentTab = tabName;

		// Refresh data if switching to stats
		if (tabName === "stats") {
			this.updateStats();
			this.drawChart();
		}
	}

	async loadSettings() {
		try {
			const result = await this.getStorageData(STORAGE_KEYS.SETTINGS);
			if (result) {
				this.settings = { ...DEFAULT_SETTINGS, ...result };
			}
		} catch (error) {
			console.error("Failed to load settings:", error);
			this.showToast("Ayarlar yüklenirken hata oluştu", "danger");
		}
	}

	async saveSettings() {
		try {
			await this.setStorageData(STORAGE_KEYS.SETTINGS, this.settings);
			this.showToast("Ayarlar kaydedildi", "success");
		} catch (error) {
			console.error("Failed to save settings:", error);
			this.showToast("Ayarlar kaydedilemedi", "danger");
		}
	}

	async loadBlockedHashes() {
		try {
			const result = await this.getStorageData(STORAGE_KEYS.BLOCKED_HASHES);
			this.blockedHashes = result || [];
			this.filteredHashes = [...this.blockedHashes];
		} catch (error) {
			console.error("Failed to load blocked hashes:", error);
			this.showToast("Engellenmiş videolar yüklenirken hata oluştu", "danger");
		}
	}

	async loadStats() {
		try {
			const result = await this.getStorageData(STORAGE_KEYS.STATS);
			if (result) {
				this.stats = { ...this.stats, ...result };
			}

			// Calculate stats from blocked hashes
			this.calculateStats();
		} catch (error) {
			console.error("Failed to load stats:", error);
		}
	}

	calculateStats() {
		const now = Date.now();
		const oneDayMs = 24 * 60 * 60 * 1000;
		const oneWeekMs = 7 * oneDayMs;

		this.stats.totalBlocked = this.blockedHashes.length;
		this.stats.dailyBlocked = this.blockedHashes.filter(
			(item) => now - (item.added || 0) < oneDayMs,
		).length;
		this.stats.weeklyBlocked = this.blockedHashes.filter(
			(item) => now - (item.added || 0) < oneWeekMs,
		).length;

		// Calculate storage size
		const dataStr = JSON.stringify(this.blockedHashes);
		this.stats.storageSize = Math.round((dataStr.length / 1024) * 100) / 100;

		// Calculate daily stats for chart
		this.stats.dailyStats = Array(7).fill(0);
		for (let i = 0; i < 7; i++) {
			const dayStart = now - (i + 1) * oneDayMs;
			const dayEnd = now - i * oneDayMs;

			this.stats.dailyStats[6 - i] = this.blockedHashes.filter((item) => {
				const added = item.added || 0;
				return added >= dayStart && added < dayEnd;
			}).length;
		}
	}

	updateUI() {
		// Update settings UI
		document.getElementById("auto-scan").checked = this.settings.autoScan;
		document.getElementById("sensitivity").value = this.settings.sensitivity;
		document.getElementById("sensitivity-value").textContent =
			this.settings.sensitivity;
		document.getElementById("show-notifications").checked =
			this.settings.showNotifications;
		document.getElementById("log-level").value = this.settings.logLevel;
		document.getElementById("max-retries").value = this.settings.maxRetries;

		// Update version info
		document.getElementById("version").textContent =
			chrome.runtime.getManifest().version;
		document.getElementById("last-update").textContent =
			new Date().toLocaleDateString("tr-TR");
	}

	updateStats() {
		document.getElementById("total-blocked").textContent =
			this.stats.totalBlocked;
		document.getElementById("weekly-blocked").textContent =
			this.stats.weeklyBlocked;
		document.getElementById("daily-blocked").textContent =
			this.stats.dailyBlocked;
		document.getElementById("storage-size").textContent =
			`${this.stats.storageSize} KB`;

		this.updateRecentActivity();
	}

	updateRecentActivity() {
		const container = document.getElementById("recent-blocks");

		if (this.blockedHashes.length === 0) {
			container.innerHTML = `
                <div class="activity-item placeholder">
                    <span class="activity-icon">📺</span>
                    <span class="activity-text">Henüz engellenmiş video bulunmuyor</span>
                    <span class="activity-time">-</span>
                </div>
            `;
			return;
		}

		const recent = [...this.blockedHashes]
			.sort((a, b) => (b.added || 0) - (a.added || 0))
			.slice(0, 5);

		container.innerHTML = recent
			.map(
				(item) => `
            <div class="activity-item">
                <span class="activity-icon">🚫</span>
                <span class="activity-text">Video engellendi: ${item.hash.substring(0, 8)}...</span>
                <span class="activity-time">${this.formatTime(item.added)}</span>
            </div>
        `,
			)
			.join("");
	}

	drawChart() {
		const canvas = document.getElementById("blockingChart");
		const ctx = canvas.getContext("2d");

		// Set canvas size
		canvas.width = canvas.offsetWidth;
		canvas.height = 200;

		const width = canvas.width;
		const height = canvas.height;
		const padding = 40;
		const chartWidth = width - 2 * padding;
		const chartHeight = height - 2 * padding;

		// Clear canvas
		ctx.clearRect(0, 0, width, height);

		// Draw background
		ctx.fillStyle = "#f8f9fa";
		ctx.fillRect(0, 0, width, height);

		// Find max value
		const maxValue = Math.max(...this.stats.dailyStats, 1);

		// Draw bars
		const barWidth = chartWidth / 7;
		const days = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

		this.stats.dailyStats.forEach((value, index) => {
			const barHeight = (value / maxValue) * chartHeight;
			const x = padding + index * barWidth;
			const y = height - padding - barHeight;

			// Draw bar
			ctx.fillStyle = index === 6 ? "#1DA1F2" : "#667eea";
			ctx.fillRect(x + 5, y, barWidth - 10, barHeight);

			// Draw value on top
			ctx.fillStyle = "#14171a";
			ctx.font = "12px -apple-system, sans-serif";
			ctx.textAlign = "center";
			ctx.fillText(value.toString(), x + barWidth / 2, y - 5);

			// Draw day label
			ctx.fillText(days[index], x + barWidth / 2, height - 10);
		});

		// Draw title
		ctx.fillStyle = "#14171a";
		ctx.font = "bold 14px -apple-system, sans-serif";
		ctx.textAlign = "left";
		ctx.fillText("Günlük Engellenme Sayısı", padding, 25);
	}

	applyFilters() {
		const searchTerm = document
			.getElementById("hash-search")
			.value.toLowerCase();
		const dateFilter = document.getElementById("date-filter").value;
		const sortOrder = document.getElementById("sort-order").value;

		let filtered = [...this.blockedHashes];

		// Apply search filter
		if (searchTerm) {
			filtered = filtered.filter((item) =>
				item.hash.toLowerCase().includes(searchTerm),
			);
		}

		// Apply date filter
		const now = Date.now();
		const oneDayMs = 24 * 60 * 60 * 1000;
		const oneWeekMs = 7 * oneDayMs;
		const oneMonthMs = 30 * oneDayMs;

		switch (dateFilter) {
			case "today":
				filtered = filtered.filter(
					(item) => now - (item.added || 0) < oneDayMs,
				);
				break;
			case "week":
				filtered = filtered.filter(
					(item) => now - (item.added || 0) < oneWeekMs,
				);
				break;
			case "month":
				filtered = filtered.filter(
					(item) => now - (item.added || 0) < oneMonthMs,
				);
				break;
		}

		// Apply sort
		filtered.sort((a, b) => {
			if (sortOrder === "newest") {
				return (b.added || 0) - (a.added || 0);
			} else {
				return (a.added || 0) - (b.added || 0);
			}
		});

		this.filteredHashes = filtered;
		this.currentPage = 1;
		this.renderBlockedList();
	}

	filterHashes(searchTerm) {
		this.applyFilters();
	}

	renderBlockedList() {
		const container = document.getElementById("blocked-list");
		const pagination = document.getElementById("pagination");

		if (this.filteredHashes.length === 0) {
			container.innerHTML = `
                <div class="blocked-item placeholder">
                    <div class="blocked-content">
                        <span class="blocked-text">Arama kriterlerine uygun video bulunamadı</span>
                        <span class="blocked-subtitle">Filtreleri değiştirmeyi deneyin</span>
                    </div>
                </div>
            `;
			pagination.style.display = "none";
			return;
		}

		// Calculate pagination
		const totalPages = Math.ceil(
			this.filteredHashes.length / this.itemsPerPage,
		);
		const startIndex = (this.currentPage - 1) * this.itemsPerPage;
		const endIndex = Math.min(
			startIndex + this.itemsPerPage,
			this.filteredHashes.length,
		);
		const pageItems = this.filteredHashes.slice(startIndex, endIndex);

		// Render items
		container.innerHTML = pageItems
			.map(
				(item, index) => `
            <div class="blocked-item">
                <div class="blocked-content">
                    <div class="blocked-hash">${item.hash}</div>
                    <div class="blocked-date">${this.formatDate(item.added)}</div>
                </div>
                <div class="blocked-actions-item">
                    <button class="btn small danger" onclick="optionsManager.removeHash('${item.hash}')">
                        🗑️ Sil
                    </button>
                </div>
            </div>
        `,
			)
			.join("");

		// Update pagination
		if (totalPages > 1) {
			pagination.style.display = "flex";
			document.getElementById("page-info").textContent =
				`Sayfa ${this.currentPage} / ${totalPages}`;
			document.getElementById("prev-page").disabled = this.currentPage === 1;
			document.getElementById("next-page").disabled =
				this.currentPage === totalPages;
		} else {
			pagination.style.display = "none";
		}
	}

	changePage(direction) {
		const totalPages = Math.ceil(
			this.filteredHashes.length / this.itemsPerPage,
		);
		const newPage = this.currentPage + direction;

		if (newPage >= 1 && newPage <= totalPages) {
			this.currentPage = newPage;
			this.renderBlockedList();
		}
	}

	async removeHash(hash) {
		try {
			this.blockedHashes = this.blockedHashes.filter(
				(item) => item.hash !== hash,
			);
			await this.setStorageData(
				STORAGE_KEYS.BLOCKED_HASHES,
				this.blockedHashes,
			);

			this.applyFilters();
			this.calculateStats();
			this.updateStats();

			this.showToast("Video hash'i silindi", "success");
		} catch (error) {
			console.error("Failed to remove hash:", error);
			this.showToast("Hash silinirken hata oluştu", "danger");
		}
	}

	async clearAllHashes() {
		try {
			this.blockedHashes = [];
			await this.setStorageData(STORAGE_KEYS.BLOCKED_HASHES, []);

			this.applyFilters();
			this.calculateStats();
			this.updateStats();
			this.drawChart();

			this.showToast("Tüm hash'ler silindi", "success");
		} catch (error) {
			console.error("Failed to clear all hashes:", error);
			this.showToast("Hash'ler silinirken hata oluştu", "danger");
		}
	}

	exportBlockedList() {
		const data = {
			exportedAt: new Date().toISOString(),
			version: chrome.runtime.getManifest().version,
			blockedHashes: this.blockedHashes,
			stats: this.stats,
		};

		const blob = new Blob([JSON.stringify(data, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);

		const a = document.createElement("a");
		a.href = url;
		a.download = `twitter-video-blocker-export-${new Date().toISOString().split("T")[0]}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		this.showToast("Veriler dışa aktarıldı", "success");
	}

	backupData() {
		const data = {
			settings: this.settings,
			blockedHashes: this.blockedHashes,
			stats: this.stats,
			backupDate: new Date().toISOString(),
			version: chrome.runtime.getManifest().version,
		};

		const blob = new Blob([JSON.stringify(data, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);

		const a = document.createElement("a");
		a.href = url;
		a.download = `twitter-video-blocker-backup-${new Date().toISOString().split("T")[0]}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		this.showToast("Yedek oluşturuldu", "success");
	}

	async restoreData(event) {
		const file = event.target.files[0];
		if (!file) return;

		try {
			const text = await file.text();
			const data = JSON.parse(text);

			if (data.settings) {
				this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
				await this.setStorageData(STORAGE_KEYS.SETTINGS, this.settings);
			}

			if (data.blockedHashes) {
				this.blockedHashes = data.blockedHashes;
				await this.setStorageData(
					STORAGE_KEYS.BLOCKED_HASHES,
					this.blockedHashes,
				);
			}

			if (data.stats) {
				this.stats = { ...this.stats, ...data.stats };
				await this.setStorageData(STORAGE_KEYS.STATS, this.stats);
			}

			// Refresh UI
			this.updateUI();
			this.calculateStats();
			this.updateStats();
			this.applyFilters();
			this.drawChart();

			this.showToast("Veriler geri yüklendi", "success");
		} catch (error) {
			console.error("Failed to restore data:", error);
			this.showToast("Veri geri yüklenirken hata oluştu", "danger");
		}

		// Reset file input
		event.target.value = "";
	}

	async resetSettings() {
		this.settings = { ...DEFAULT_SETTINGS };
		await this.setStorageData(STORAGE_KEYS.SETTINGS, this.settings);
		this.updateUI();
		this.showToast("Ayarlar sıfırlandı", "success");
	}

	showConfirmModal(title, message, action) {
		document.getElementById("modal-title").textContent = title;
		document.getElementById("modal-message").textContent = message;
		this.pendingAction = action;
		document.getElementById("confirm-modal").classList.add("show");
	}

	hideModal() {
		document.getElementById("confirm-modal").classList.remove("show");
		this.pendingAction = null;
	}

	showToast(message, type = "info") {
		const toast = document.getElementById("toast");
		toast.textContent = message;
		toast.className = `toast ${type} show`;

		setTimeout(() => {
			toast.classList.remove("show");
		}, 3000);
	}

	formatDate(timestamp) {
		if (!timestamp) return "Bilinmiyor";

		const date = new Date(timestamp);
		return date.toLocaleDateString("tr-TR", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	}

	formatTime(timestamp) {
		if (!timestamp) return "-";

		const now = Date.now();
		const diff = now - timestamp;

		const minutes = Math.floor(diff / (1000 * 60));
		const hours = Math.floor(diff / (1000 * 60 * 60));
		const days = Math.floor(diff / (1000 * 60 * 60 * 24));

		if (minutes < 1) return "Az önce";
		if (minutes < 60) return `${minutes} dakika önce`;
		if (hours < 24) return `${hours} saat önce`;
		if (days < 7) return `${days} gün önce`;

		return new Date(timestamp).toLocaleDateString("tr-TR");
	}

	// Storage helper methods
	getStorageData(key) {
		return new Promise((resolve, reject) => {
			if (!chrome || !chrome.storage || !chrome.storage.local) {
				reject(new Error("Chrome storage API not available"));
				return;
			}

			chrome.storage.local.get([key], (result) => {
				if (chrome.runtime.lastError) {
					reject(new Error(chrome.runtime.lastError.message));
				} else {
					resolve(result[key]);
				}
			});
		});
	}

	setStorageData(key, value) {
		return new Promise((resolve, reject) => {
			if (!chrome || !chrome.storage || !chrome.storage.local) {
				reject(new Error("Chrome storage API not available"));
				return;
			}

			chrome.storage.local.set({ [key]: value }, () => {
				if (chrome.runtime.lastError) {
					reject(new Error(chrome.runtime.lastError.message));
				} else {
					resolve();
				}
			});
		});
	}
}

// Global instance
let optionsManager;

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
	optionsManager = new OptionsManager();
});

// Handle storage changes from other parts of the extension
if (chrome && chrome.storage && chrome.storage.onChanged) {
	chrome.storage.onChanged.addListener((changes, area) => {
		if (area !== "local") return;

		if (optionsManager) {
			if (changes[STORAGE_KEYS.BLOCKED_HASHES]) {
				optionsManager.loadBlockedHashes().then(() => {
					optionsManager.calculateStats();
					optionsManager.updateStats();
					optionsManager.applyFilters();
					optionsManager.drawChart();
				});
			}
		}
	});
}
