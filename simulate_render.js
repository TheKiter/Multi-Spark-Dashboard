const fs = require('fs');
const http = require('http');

// 1. Fetch live metrics
http.get('http://100.120.5.111:8050/api/metrics', (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        const liveMetrics = JSON.parse(body);
        runSimulation(liveMetrics);
    });
});

function runSimulation(metrics) {
    console.log("Mocking React environment...");
    
    // Mock React hooks
    let stateIndex = 0;
    const states = [
        metrics,       // 1. metrics state
        "dark",        // 2. theme state
        "all-nodes",   // 3. activeTab state
        "table"        // 4. viewMode state
    ];
    
    global.React = {
        useState: (initial) => {
            const val = states[stateIndex] !== undefined ? states[stateIndex] : initial;
            stateIndex++;
            return [val, (newVal) => {}];
        },
        useEffect: () => {},
        useRef: () => ({ current: null })
    };
    
    global.ReactDOM = {
        createRoot: () => ({ render: () => {} })
    };
    
    // Read app.js, stripping out ReactDOM.createRoot mount at the bottom
    let code = fs.readFileSync('app.js', 'utf8');
    code = code.replace(/const root = ReactDOM\.createRoot[\s\S]*$/, '');
    
    // Compile JSX roughly or mock React.createElement
    // To execute without full JSX compilation, we can let Babel compile it first!
    console.log("Compiling app.js with Babel Standalone...");
    const babel = require('./babel.min.js');
    const compiled = babel.transform(code, { presets: ['react'] }).code;
    
    console.log("Evaluating compiled script...");
    try {
        // Run code in global context
        eval(compiled);
        
        // Call the App component
        console.log("Invoking App() render method...");
        const element = App();
        console.log("Render completed successfully without exceptions!");
    } catch (err) {
        console.error("\n!!! RUNTIME RENDER CRASH DETECTED !!!");
        console.error(err.stack || err);
    }
}
