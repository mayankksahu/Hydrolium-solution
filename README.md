🛢️ Smart Tank Monitor – Petrol Pump Water Detection
A modern, responsive web application for real-time monitoring of petrol pump tanks with water contamination detection, pump status tracking, and historical data visualization.

Built with TailwindCSS, Font Awesome, and ThingSpeak API integration, this system enables petrol pump owners and operators to keep a close eye on their tank’s health, anywhere, anytime.

✨ Features
🔐 Authentication System – Secure login & signup pages with password visibility toggle.

📊 Real-time Dashboard – Displays live tank levels, contamination alerts, pump and sensor status.

🗂️ History Tracking – Keeps the last 2 hours of readings with automatic old data removal.

📄 PDF Export – Export historical data as a PDF using jsPDF.

📱 Responsive UI – Optimized for desktop, tablet, and mobile.

🎨 Smooth Animations – Custom animations for tank filling, status pulsing, and UI transitions.

👤 Profile Management – Manage personal details, including Wi-Fi credentials.

🌊 Contamination Alerts – ML-backed threat detection for water contamination.

📦 Offline Demo Mode – Built-in test credentials for quick exploration.

🚀 Quick Start
Clone the repository

bash
Copy
Edit
git clone https://github.com/your-username/smart-tank-monitor.git
cd smart-tank-monitor
Open the project
Simply open index.html in your browser to test the demo mode.

Integrate with ThingSpeak API

Update your API key and channel details in tank-monitor.js.

Set fetch interval (default: 15 seconds).

Run a Local Server (optional for API testing)

bash
Copy
Edit
npx serve .
🧩 Tech Stack
Frontend: HTML5, TailwindCSS, JavaScript (ES6+)

Icons: Font Awesome

Data API: ThingSpeak, Custom Threat Detection API

PDF Generation: jsPDF + jsPDF AutoTable

Animations: CSS keyframes & transitions

🛠️ Folder Structure
bash
Copy
Edit
smart-tank-monitor/
│── index.html           # Main entry point
│── tank-monitor.js      # Core application logic
│── styles.css           # Custom styles (if separated)
│── assets/              # Images, icons, etc.
│── README.md            # Project documentation
🧪 Demo Credentials
Use these for quick testing without creating a new account:

makefile
Copy
Edit
Email: admin@tankmonitor.com
Password: admin123
📸 Screenshots
Login Page	Dashboard	History View

💡 Fun Fact
Petrol floats on water, but water in petrol tanks can lead to engine damage and loss of fuel quality.
This system ensures you catch the problem before your customers do 🚗💨.

📜 License
This project is licensed under the MIT License – feel free to modify and distribute.
