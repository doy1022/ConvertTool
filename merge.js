// CSVファイルのマージ
function mergeCSV() {
    const file1 = document.getElementById('file1').files[0];
    const file2 = document.getElementById('file2').files[0];

    if (!file1 || !file2) {
        alert("2つのCSVファイルをアップロードしてください。");
        return;
    }

    const reader1 = new FileReader();
    const reader2 = new FileReader();

    reader1.onload = function (e1) {
        const csv1 = e1.target.result;
        reader2.onload = function (e2) {
            const csv2 = e2.target.result;
            try {
                const mergedCSV = processCSV(csv1, csv2);
                downloadCSV(mergedCSV, 'merged.csv');
            } catch (error) {
                alert(error.message);
            }
        };
        reader2.readAsText(file2);
    };
    reader1.readAsText(file1);
}

// CSVファイルの解析
function parseCSV(csv) {
    const lines = csv.split('\n').map(line => line.trim()).filter(line => line);
    const header = lines[0].split(',');
    const rows = lines.slice(1).map(line => line.split(','));
    return { header, rows };
}

// 配列をオブジェクトに変換
function arrayToObj(headers, row) {
    const obj = {};
    headers.forEach((header, i) => {
        obj[header] = row[i];
    });
    return obj;
}

// CSVファイルのマージ処理
function processCSV(csv1, csv2) {
    const { header: header1, rows: rows1 } = parseCSV(csv1);
    const { header: header2, rows: rows2 } = parseCSV(csv2);

    // 両ファイルのヘッダーをマージして重複を排除
    const fullHeader = Array.from(new Set([...header1, ...header2]));

    // 重複カラム「宛名番号」のインデックスを見つける
    const index1 = header1.indexOf('宛名番号');
    const index2 = header2.indexOf('宛名番号');

    // マップを作成してデータを整理
    const map = new Map();
    rows1.forEach(row => {
        map.set(row[index1], { ...map.get(row[index1]), ...arrayToObj(header1, row) });
    });
    rows2.forEach(row => {
        map.set(row[index2], { ...map.get(row[index2]), ...arrayToObj(header2, row) });
    });

    // マージしたデータを出力形式に変換
    const output = [fullHeader.join(',')];
    map.forEach((value, key) => {
        const row = fullHeader.map(header => value[header] || '');
        output.push(row.join(','));
    });

    return output.join('\n');
}

// 課税対象の住民を除外する処理
function handleFile() {
    const fileInput = document.getElementById('csvFile1');
    const file = fileInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
            const text = event.target.result;
            const lines = text.split('\n').map(line => line.split(','));
            const headerIndex = lines[0].indexOf('賦課');
            if (headerIndex === -1) {
                alert('賦課列が見つかりません。');
                return;
            }

            const filteredLines = lines.filter((line, index) => {
                return index === 0 || line[headerIndex] !== '課税対象';
            });

            const output = filteredLines.map(line => line.join(',')).join('\n');
            downloadCSV(output, 'filtered.csv');
        };
        reader.readAsText(file);
    } else {
        alert('ファイルを選択してください。');
    }
}

// 世帯員の人数が1で、消除日、消除届出日、消除事由コードが入力されている行を除外する処理
function filterSingleHouseholds() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
            const text = event.target.result;
            const lines = text.split('\n').map(line => line.split(','));

            // ヘッダー行から必要な列のインデックスを取得
            const headers = lines[0];
            const membersIndex = headers.indexOf('世帯員の人数');
            const removalDateIndex = headers.indexOf('消除日');
            const notificationDateIndex = headers.indexOf('消除届出日');
            const reasonCodeIndex = headers.indexOf('消除事由コード');

            // これらの項目が見つからない場合のエラーハンドリング
            if (membersIndex === -1 || removalDateIndex === -1 || notificationDateIndex === -1 || reasonCodeIndex === -1) {
                alert('必要なヘッダーがいずれか見つかりません。');
                return;
            }

            // 条件にマッチしない行をフィルタリング
            const filteredLines = lines.filter((line, index) => {
                // ヘッダー行は常に含める
                if (index === 0) return true;

                // 条件：世帯員の人数が1ではない、または、任意の消除関連フィールドが空である
                return !(line[membersIndex] === '1' &&
                         line[removalDateIndex].trim() !== '' &&
                         line[notificationDateIndex].trim() !== '' &&
                         line[reasonCodeIndex].trim() !== '');
            });

            const output = filteredLines.map(line => line.join(',')).join('\n');
            downloadCSV(output, 'filtered_single_households.csv');
        };
        reader.readAsText(file);
    } else {
        alert('ファイルを選択してください。');
    }
}

// CSVファイルをダウンロード
function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
