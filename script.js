// script.js

let step = 1; // 現在の工程を保持する変数

// 工程①の処理
function processStep1() {
    const fileA = document.getElementById('fileA').files[0];
    const fileB = document.getElementById('fileB').files[0];
    
    if (!fileA || !fileB) {
        alert('ファイルAとファイルBを選択してください。');
        setError(1);
        return;
    }
    
    const readerA = new FileReader();
    const readerB = new FileReader();
    
    readerA.onload = function(e) {
        const contentA = e.target.result;
        readerB.onload = function(e) {
            const contentB = e.target.result;
            const mergedContent = mergeCSVFiles(contentA, contentB);
            downloadFile('mid_prod1.csv', mergedContent);
            updateProgress(1, 'completed');
            showNextStep(1);
            updateProgress(2, 'current');
        };
        readerB.readAsText(fileB);
    };
    readerA.readAsText(fileA);
    updateProgress(1, 'current');
}

// 工程②の処理
function processStep2() {
    const fileMidProd1 = document.getElementById('fileMidProd1').files[0];
    const fileC = document.getElementById('fileC').files[0];
    
    if (!fileMidProd1) {
        alert('ファイルmid_prod1.csvがありません。');
        setError(2);
        return;
    }
    if (!fileC) {
        alert('ファイルCを選択してください。');
        setError(2);
        return;
    }
    
    const readerMidProd1 = new FileReader();
    const readerC = new FileReader();
    
    readerMidProd1.onload = function(e) {
        const contentMidProd1 = e.target.result;
        readerC.onload = function(e) {
            const contentC = e.target.result;
            const mergedContent = mergeCSVFiles(contentMidProd1, contentC);
            downloadFile('mid_prod2.csv', mergedContent);
            updateProgress(2, 'completed');
            // 工程③～⑤の処理を実行する部分を追加
        };
        readerC.readAsText(fileC);
    };
    readerMidProd1.readAsText(fileMidProd1);
    updateProgress(2, 'current');
}

// CSVファイルのマージ処理
function mergeCSVFiles(contentA, contentB) {
    // CSVファイルのマージ処理を追加
}

// その他の関数（省略）
