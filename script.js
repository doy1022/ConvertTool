// script.js

function processStep(step) {
    const fileInputIds = [
        ['fileA', 'fileB'],
        ['fileC', 'fileD'],
        ['fileE', 'fileF'],
        ['fileG', 'fileH'],
        ['fileI', 'fileJ']
    ];
    const [fileId1, fileId2] = fileInputIds[step - 1];
    const file1 = document.getElementById(fileId1).files[0];
    const file2 = document.getElementById(fileId2).files[0];
    
    if (!file1 || !file2) {
        alert('ファイルを選択してください。');
        return;
    }
    
    const reader1 = new FileReader();
    const reader2 = new FileReader();
    
    reader1.onload = function(e) {
        const content1 = e.target.result;
        reader2.onload = function(e) {
            const content2 = e.target.result;
            const intermediateContent = mergeCSV(content1, content2);
            downloadFile(`intermediate${step}.csv`, intermediateContent);
            updateProgress(step);
            showNextStep(step);
        };
        reader2.readAsText(file2);
    };
    reader1.readAsText(file1);
}

function showNextStep(currentStep) {
    if (currentStep < 5) {
        const nextStep = currentStep + 1;
        document.getElementById(`step${nextStep}`).classList.remove('hidden');
        document.getElementById(`flowStep${nextStep}`).classList.remove('hidden');
    }
}

function updateProgress(currentStep) {
    for (let i = 1; i <= 5; i++) {
        const flowStep = document.getElementById(`flowStep${i}`);
        if (i < currentStep) {
            flowStep.classList.add('completed');
            flowStep.classList.remove('current');
        } else if (i === currentStep) {
            flowStep.classList.add('current');
            flowStep.classList.remove('completed');
        } else {
            flowStep.classList.remove('current');
            flowStep.classList.remove('completed');
        }
    }
}

function mergeCSV(content1, content2) {
    return content1 + '\n' + content2;
}

function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}
