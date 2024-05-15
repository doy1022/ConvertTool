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
        setError(step);
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
            updateProgress(step, 'completed');
            if (step < 5) {
                showNextStep(step);
                updateProgress(step + 1, 'current');
            }
        };
        reader2.readAsText(file2);
    };
    reader1.readAsText(file1);
    updateProgress(step, 'current');
}

function showNextStep(currentStep) {
    const nextStep = currentStep + 1;
    document.getElementById(`step${nextStep}`).classList.remove('hidden');
}

function updateProgress(step, status) {
    const flowStep = document.getElementById(`flowStep${step}`);
    flowStep.classList.remove('not-started', 'current', 'completed', 'error');
    flowStep.classList.add(status);
}

function setError(step) {
    updateProgress(step, 'error');
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
