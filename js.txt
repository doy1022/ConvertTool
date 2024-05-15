// script.js

function processStep1() {
    const fileA = document.getElementById('fileA').files[0];
    const fileB = document.getElementById('fileB').files[0];
    
    if (!fileA || !fileB) {
        alert('ファイルAとファイルBを選択してください。');
        return;
    }
    
    // CSVファイルの読み込みと処理
    const readerA = new FileReader();
    const readerB = new FileReader();
    
    readerA.onload = function(e) {
        const contentA = e.target.result;
        readerB.onload = function(e) {
            const contentB = e.target.result;
            // ここでファイルAとファイルBの内容をマージして中間ファイルCを生成します
            const intermediateContent = mergeCSV(contentA, contentB);
            downloadFile('intermediateC.csv', intermediateContent);
            
            // 次のステップを表示
            document.getElementById('step1').classList.add('hidden');
            document.getElementById('flowStep1').classList.add('active');
            showStep2();
        };
        readerB.readAsText(fileB);
    };
    readerA.readAsText(fileA);
}

function showStep2() {
    document.getElementById('flowStep2').classList.remove('hidden');
    const step2Div = document.createElement('div');
    step2Div.className = 'step';
    step2Div.id = 'step2';
    
    step2Div.innerHTML = `
        <input type="file" id="fileC" accept=".csv">
        <input type="file" id="fileD" accept=".csv">
        <button onclick="processStep2()">処理を実行 (中間ファイルC & ファイルD)</button>
    `;
    document.getElementById('fileInputs').appendChild(step2Div);
}

function processStep2() {
    const fileC = document.getElementById('fileC').files[0];
    const fileD = document.getElementById('fileD').files[0];
    
    if (!fileC || !fileD) {
        alert('中間ファイルCとファイルDを選択してください。');
        return;
    }
    
    // CSVファイルの読み込みと処理
    const readerC = new FileReader();
    const readerD = new FileReader();
    
    readerC.onload = function(e) {
        const contentC = e.target.result;
        readerD.onload = function(e) {
            const contentD = e.target.result;
            // ここで中間ファイルCとファイルDの内容をマージしてファイナルファイルを生成します
            const finalContent = mergeCSV(contentC, contentD);
            downloadFile('finalE.csv', finalContent);
            
            // 次のステップを表示
            document.getElementById('step2').classList.add('hidden');
            document.getElementById('flowStep2').classList.add('active');
            // showStep3(); // 必要に応じて次のステップを表示
        };
        readerD.readAsText(fileD);
    };
    readerC.readAsText(fileC);
}

function mergeCSV(contentA, contentB) {
    // CSVの内容をマージするロジックをここに実装します
    // 今回は単純に連結する例を示します
    return contentA + '\n' + contentB;
}

function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}
