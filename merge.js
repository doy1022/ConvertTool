/* 定数定義 */
const LOG_LEVEL = 'debug'; // Log出力のレベルを選択（debug, info, warn, error）
const MIDDLE_FILE_1 = "中間ファイル①.csv";
const MIDDLE_FILE_2 = "中間ファイル②.csv";

/* 1.住基情報・税情報・住民票コード・前住所地の住所コードをマージする大元の処理 */
function mergeCSV() {
    // 各ファイルのIDを配列に格納する
    const fileIds = ['file1', 'file2', 'file3', 'file4'];
    // 各ファイルのIDを配列に格納する
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 処理開始log
    logger.info('STEP 1 処理を開始しました');

    // FileReaderオブジェクトを生成し、各ファイルの読み込みを行う（map処理内にFileReaderの生成を含む）
    const readers = files.map(file => new FileReader());
    const results = [];

    // 各ファイルを順に読み込む
    readers.forEach((reader, index) => {
        // ファイルの読み込みが完了したタイミングでonload処理が走る（onloadイベント）
        reader.onload = function (e) {
            // 読み込んだデータをresults配列に保存する
            // e.target.result:FileReaderが読み込んだファイルの内容（文字列）
            results[index] = e.target.result;

            // results配列内のデータがすべてそろったかを確認し、後続処理を行う
            if (results.filter(result => result).length === file_num) {
                try {
                    // 読み込んだファイル内データのマージをおこなう
                    const mergedCSV = processCSV(...results);
                    downloadCSV(mergedCSV, MIDDLE_FILE_1);
                } catch (error) {
                    // catchしたエラーを表示
                    logger.error(error);
                } finally {
                    logger.info('STEP 1 処理を終了しました');
                }
            }
        };

        // onloadイベントを発火
        reader.readAsText(files[index]);
    });

    // マージ処理用function
    function processCSV(...csvFiles) {
        // 各CSVファイルをヘッダーとデータ行に分解し、1行ずつ配列に格納する
        const parsedCSVs = csvFiles.map(csv => parseCSV(csv));
        // 住基情報ヘッダー内の「ＦＯ－」を取り除く
        parsedCSVs[0].header = removeStrFromHeader(parsedCSVs[0].header, "ＦＯ－");
        // 税情報ヘッダー内の「ＦＩ－」を取り除く
        parsedCSVs[1].header = removeStrFromHeader(parsedCSVs[1].header, "ＦＩ－");
        // 各CSVファイルのヘッダーを統合して（flatMap）一意なヘッダー（Set）のリストを作成
        const fullHeader = Array.from(new Set(parsedCSVs.flatMap(parsed => parsed.header)));
        // 各CSVファイルの「宛名番号」カラムのインデックスを取得し、配列に保存する→各ファイルで「宛名番号」がどの位置にあるかを把握する
        const addressIndex = parsedCSVs.map(parsed => parsed.header.indexOf('宛名番号'));
        // 各CSVデータをマッピングしマージ処理を行う
        const map = new Map();
        parsedCSVs.forEach((parsed, fileIndex) => {
            parsed.rows.forEach(row => {
                const addressNumber = row[addressIndex[fileIndex]];
                // headersとrowからオブジェクトを生成する
                const rowObj = parsed.header.reduce((obj, header, i) => {
                    obj[header] = row[i];
                    return obj;
                }, {});
                map.set(addressNumber, { ...map.get(addressNumber), ...rowObj });
            });
        });
        // 出力用のCSVデータを生成する
        const output = [fullHeader.join(',')];
        map.forEach(value => {
            const row = fullHeader.map(header => value[header] || '');
            output.push(row.join(','));
        });
        return output.join('\n');
    }
}

/* 2.課税対象の住民を除外する処理 */
function handleFile() {
    // 各ファイルのIDを配列に格納する
    const fileIds = ['midFile1'];
    // 各ファイルのIDを配列に格納する
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 処理開始log
    logger.info('STEP 2 処理を開始しました');

    // 読み込んだデータをresults配列の対応する位置に保存する
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            // e.target.result:FileReaderが読み込んだファイルの内容（文字列）
            let text = e.target.result;

            // 必要なヘッダーがあるかチェック
            const lines = text.split('\n').map(line => line.split(','));
            const headers = lines[0];
            const requiredColumns = [
                '世帯員の人数', 
                '消除日', 
                '消除届出日', 
                '消除事由コード'
            ];
            // カラムのインデックスを取得
            const columnIndices = requiredColumns.map(col => headers.indexOf(col));
            // 足りないカラムをチェック
            const missingColumns = requiredColumns.filter((col, index) => columnIndices[index] === -1);

            if (missingColumns.length > 0) {
                throw new Error (`次の列が見つかりませんでした： ${missingColumns.join(', ')}\nファイルを確認してください。`);
            }

            // 課税対象の住民を除外する処理
            const filterTaxExcludedText = filterTaxExcluded(text);
            if (!filterTaxExcludedText) {
                logger.warn("出力対象レコードが存在しませんでした。");
            } else {
                // 死亡している住民を除外する処理
                const filterDeathText = filterDeath(filterTaxExcludedText, columnIndices)
                if (!filterDeathText) {
                    logger.warn("出力対象レコードが存在しませんでした。");
                } else {
                    downloadCSV(filterDeathText, MIDDLE_FILE_2);
                }
            }
        } catch (error) {
            // catchしたエラーを表示
            logger.error(error);
        } finally {
            logger.info('STEP 2 処理を終了しました');
        }
    };
    // onloadイベントを発火
    reader.readAsText(files[0]);

    /* 死亡している（世帯員の人数が1で、消除日、消除届出日、消除事由コードが入力されている）住民を除外する処理 */
    function filterDeath(text,columnIndices) {
        // ヘッダーとデータレコーダーに分割
        const { header, rows } = parseCSV(text);

        // 条件に合致するレコードのみをフィルタ
        const filteredLines = rows.filter(line => {
            const [members, removalDate, notificationDate, reasonCode] = [
                line[columnIndices[0]],
                line[columnIndices[1]],
                line[columnIndices[2]],
                line[columnIndices[3]]
            ];
            return !(members === '1' && removalDate && notificationDate && reasonCode);
        });

        return [header.join(','), ...filteredLines.map(line => line.join(','))].join('\n');
    }
}
/* 

/* 4.R5給付対象者を、宛名番号をキーとして除外する処理 */
function deleteRowsByAddressNumber() {
    processTwoFiles('file5', 'file6', (csv1, csv2) => deleteRows(csv1, csv2, '宛名番号'), '中間ファイル④.csv');
}

function deleteRows(csvText1, csvText2, key) {
    // CSVテキストを行ごとに分割して配列に変換
    const lines1 = csvText1.split('\n').map(line => line.split(','));
    const lines2 = csvText2.split('\n').map(line => line.split(','));
    // ヘッダー行を取得
    const headers1 = lines1[0];
    const headers2 = lines2[0];
    // 必要な列のインデックスを取得
    const index1 = headers1.indexOf(key);
    const index2 = headers2.indexOf(key);
    // 宛名番号が見つからない場合のエラーハンドリング
    if (index1 === -1 || index2 === -1) {
        alert(`${key}列が見つかりません。`);
        return;
    }

    // 2つ目のCSVファイルの宛名番号のセットを作成
    const keySet = new Set(lines2.slice(1).map(line => line[index2].trim()));
    // 宛名番号がセットに含まれていない行をフィルタリング
    const filteredLines = lines1.filter((line, index) => index === 0 || !keySet.has(line[index1].trim()));
    // フィルタリングされた行をCSV形式に戻す
    return filteredLines.map(line => line.join(',')).join('\n');
}

/* 5.廃止事由ファイル内「廃止理由」が「18(他区課税)」の行を除外する処理 */
function deleteRowsByReason() {
    processTwoFiles('file7', 'file8', (csv1, csv2) => filterByReason(csv1, csv2), '中間ファイル⑤.csv');
}

function filterByReason(csvText1, csvText2) {
    // CSVテキストを行ごとに分割して配列に変換
    const lines1 = csvText1.split('\n').map(line => line.split(','));
    const lines2 = csvText2.split('\n').map(line => line.split(','));
    // ヘッダー行を取得
    const headers1 = lines1[0];
    const headers2 = lines2[0];
    // 必要な列のインデックスを取得
    const index1 = headers1.indexOf('宛名番号');
    const index2 = headers2.indexOf('宛名番号');
    const reasonIndex = headers2.indexOf('廃止理由');

    // インデックスが見つからない場合のエラーハンドリング
    if (index1 === -1 || index2 === -1 || reasonIndex === -1) {
        alert('宛名番号または廃止理由列が見つかりません。');
        return '';
    }

    // 廃止理由が'18'である行の宛名番号をセットに格納
    const keySet = new Set();
    for (let i = 1; i < lines2.length; i++) {
        const line = lines2[i];
        if (line[reasonIndex].trim() === '18') {
            keySet.add(line[index2].trim());
        }
    }

    // 宛名番号がセットに含まれていない行をフィルタリング
    const filteredLines = lines1.filter((line, index) => {
        if (index === 0) return true; // ヘッダー行はそのまま残す
        return !keySet.has(line[index1].trim());
    });

    // フィルタリングされた行をCSV形式に戻す
    return filteredLines.map(line => line.join(',')).join('\n');
}

/* 6.「課税区分」に値がある行を除外する（＝税情報無しの住民を抽出する）処理 */
function deleteRowsWithAssessment() {
    processSingleFile('file9', text => {
        const lines = text.split('\n').map(line => line.split(','));
        const headers = lines[0];
        const assessmentIndex = headers.indexOf('課税区分');
        if (assessmentIndex === -1) {
            alert('課税区分列が見つかりません。');
            return;
        }
        const filteredLines = lines.filter((line, index) => index === 0 || !line[assessmentIndex].trim());
        return filteredLines.map(line => line.join(',')).join('\n');
    }, '中間ファイル⑥.csv');
}

/* 7.機関コードの変換処理*/
function ChangeRowsFromInstitutionCode() {
    processTwoFiles('file11', 'file12', updateAddressCode, '中間ファイル⑦.csv');
}

function updateAddressCode(csvText1, csvText2) {
    // csvText1とcsvText2をそれぞれ分割して配列に変換
    const lines1 = csvText1.split('\n').map(line => line.split(','));
    const lines2 = csvText2.split('\n').map(line => line.split(','));
    // ヘッダー行を取得
    const headers1 = lines1[0];
    const headers2 = lines2[0];
    // 各項目の位置を確認する
    const addressCodeIndex = headers1.indexOf('転入元都道府県市区町村コード');
    const idCodeIndex = headers2.indexOf('既存の識別コード');
    const agencyCodeIndex = headers2.indexOf('機関コード');

    if (addressCodeIndex === -1 || idCodeIndex === -1 || agencyCodeIndex === -1) {
        alert('必要な列が見つかりません。');
        return;
    }

    // CSV1（住民リストの方）のヘッダーに新しいカラムを追加する
    headers1.push('情報提供者機関コード');

    const idCodeMap = new Map();
    lines2.slice(1).forEach((line, idx) => {
        // 欠落しているデータがあるかチェック
        if (!line[idCodeIndex] || !line[agencyCodeIndex]) {
            console.log(`Data missing in line ${idx + 2}:`, line);
        }
        // IDコードと機関コードを取得し、クオートを除去
        const idCode = (line[idCodeIndex] ? line[idCodeIndex].trim() : '').replace(/^"|"$/g, '');
        const agencyCode = (line[agencyCodeIndex] ? line[agencyCodeIndex].trim() : '').replace(/^"|"$/g, '');
        // マップにIDと機関コードをセット
        idCodeMap.set(idCode, agencyCode);
    });

    const updatedLines = lines1.map((line, index) => {
        // データの欠落をチェック
        if (!line[addressCodeIndex]) {
            console.log(`Data missing in line ${index + 1}:`, line);
        }
        if (index === 0) {
            // ヘッダー行はそのまま返す
            return line;
        }
        // 転入元都道府県市区町村コードを取得し、対応する機関コードを検索
        const addressCode = line[addressCodeIndex] ? line[addressCodeIndex].trim() : '';
        const agencyCode = idCodeMap.get(addressCode) || '';
        // 新しいカラムに機関コードを追加
        line.push(agencyCode);
        return line;
    });
    // 更新された行をCSV形式で結合して返す
    return updatedLines.map(line => line.join(',')).join('\n');
}

/* 8. 税情報照会用ファイル（固定長形式）を出力する処理 */
function generateTaxInfoInquiryFile() {
    processSingleFile('file10', generateFixedLengthFile, '「税情報なし」対象者.csv');
}

// 中間サーバ照会用のファイルを作成する処理（ステップ15でも使用するため、別functionとして作成した）
function generateFixedLengthFile(text) {
    const lines = text.split('\n').map(line => line.split(','));
    const headers = lines[0];

    // アウトプット用のカラムを個別に定義する。プロパティでカラム長、該当する項目、埋め値、固定値（あれば）を定義
    const column1 = { length: 2, name: '番号体系', padding: '0', value: '01' };
    const column2 = { length: 15, name: '宛名番号', padding: '0' };
    const column3 = { length: 15, name: '統合宛名番号', padding: '' };
    const column4 = { length: 17, name: '照会依頼日時' };
    const column5 = { length: 20, name: '情報照会者部署コード', padding: ' ', padDirection: 'right', value: '3595115400' };
    const column6 = { length: 20, name: '情報照会者ユーザーID', padding: '' };
    const column7 = { length: 16, name: '情報照会者機関コード', padding: '0', value: '0220113112101700' };
    const column8 = { length: 1, name: '照会側不開示コード', padding: '0', value: '1' };
    const column9 = { length: 16, name: '事務コード', padding: '0', value: 'JM01000000121000' };
    const column10 = { length: 16, name: '事務手続きコード', padding: '0', value: 'JT01010000000214' };
    const column11 = { length: 16, name: '情報照会者機関コード（委任元）', padding: '' };
    const column12 = { length: 16, name: '情報提供者機関コード（委任元）', padding: '' };
    const column13 = { length: 16, name: '情報提供者機関コード', padding: ' ', padDirection: 'right' };
    const column14 = { length: 16, name: '特定個人情報名コード', padding: '0', value: 'TM00000000000002' };
    const column15 = { length: 1, name: '照会条件区分', padding: '0', value: '0' };
    const column16 = { length: 1, name: '照会年度区分', padding: '0', value: '0' };
    const column17 = { length: 8, name: '照会開始日付', padding: '' };
    const column18 = { length: 8, name: '照会終了日付', padding: '' };
    // 全カラムを配列にまとめる
    const columnDefinitions = [column1, column2, column3, column4, column5, column6, column7, column8, column9,
        column10, column11, column12, column13, column14, column15, column16, column17, column18];

    return lines.slice(1).map(line => {
        return columnDefinitions.map(colDef => {
            const value = colDef.value || line[headers.indexOf(colDef.name)] || '';
            if (colDef.padDirection === 'left') {
                // 左側をパディング
                return value.padStart(colDef.length, colDef.padding).substring(0, colDef.length);
            } else if (colDef.padDirection === 'right') {
                // 右側をパディング
                return value.padEnd(colDef.length, colDef.padding).substring(0, colDef.length);
            } else {
                // デフォルトは左側をパディング
                return value.padStart(colDef.length, colDef.padding).substring(0, colDef.length);
            }
        }).join(',');
    }).join('\n');
}

/* 9. 住基照会用ファイル①を出力する処理 */
/* 前住所地の住所コードが「99999」である住民を抽出し、「宛名番号,住民票コード」の構成に整形する */
function generateReferencingFile1() {
    // CSVの数が1つの時の汎用処理を呼び出す（引数：①CSVファイルのID ②コールバック関数 ③出力するファイル名）
    processSingleFile('file13', text => {
        const lines = text.split('\n').map(line => line.split(','));
        const header = lines[0];
        const headerIndex = header.indexOf('転入元都道府県市区町村コード');

        if (headerIndex === -1) {
            alert('転入元都道府県市区町村コード列が見つかりません。');
            return;
        }

        // 「宛名番号」と「住民票コード」のインデックスを取得
        const indexA = header.indexOf('宛名番号');
        const indexB = header.indexOf('住民票コード');

        if (indexA === -1 || indexB === -1) {
            alert('宛名番号または住民票コード列が見つかりません。');
            return;
        }

        // filter処理を実施し、indexが0（要するにヘッダー行）と、「転入元都道府県市区町村コード」が「99999」である行をフィルタリング
        const filteredLines = lines.filter((line, index) => index === 0 || line[headerIndex] == '99999');
        // フィルタリングされた行から、宛名番号列と住民票コード列のみを抽出
        const extractedLines = filteredLines.map(line => [line[indexA], line[indexB]]);
        // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
        return extractedLines.map(line => line.join(',')).join('\n');
    }, '住基照会用ファイル①.csv');
}

/* 10. 帰化対象者を抽出する処理 */
/* 住基情報の「ＦＯ－異動事由コード」（この処理が回るころには項目名から「ＦＯ－」が消えている想定）が特定のコードである住民を抽出する */
function generateNaturalizedCitizenFile() {
    // CSVファイルを解析する関数を呼び出す（引数：CSVファイルのID、コールバック関数、出力するファイル名）
    processSingleFile('file14', function (text) {
        // CSVファイルの内容を行ごとに分割し、さらに各行をカンマで区切る
        const lines = text.split('\n').map(line => line.split(','));
        // ヘッダー行（最初の行）を取得する
        const header = lines[0];

        // アウトプット用のカラムを個別に定義する。プロパティで新しい項目名、マッピングされる旧項目名を入力する
        const column1 = { newName: '宛名番号', oldName: '宛名番号' };
        const column2 = { newName: '世帯番号', oldName: '世帯番号' };
        const column3 = { newName: 'カナ氏名', oldName: 'カナ氏名' };
        const column4 = { newName: '漢字氏名', oldName: '漢字氏名' };
        const column5 = { newName: '生年月日', oldName: '生年月日' };
        const column6 = { newName: '性別', oldName: '性別' };
        const column7 = { newName: '届出日', oldName: '届出日' };
        const column8 = { newName: '異動日', oldName: '異動日' };
        const column9 = { newName: '異動事由コード', oldName: '異動事由コード' };
        const column10 = { newName: '住民日', oldName: '住民日' };
        const column11 = { newName: '住民届出日', oldName: '住民届出日' };
        const column12 = { newName: '住民事由コード', oldName: '住民事由コード' };
        const column13 = { newName: '現住所住定日', oldName: '現住所住定日' };
        const column14 = { newName: '現住所届出日', oldName: '現住所届出日' };
        const column15 = { newName: '消除日', oldName: '消除日' };
        const column16 = { newName: '消除届出日', oldName: '消除届出日' };
        const column17 = { newName: '消除事由コード', oldName: '消除事由コード' };

        // 全カラムを配列にまとめる（ここで順番も決める）
        const columnMapping = [column1, column2, column3, column4, column5, column6, column7, column8, column9,
            column10, column11, column12, column13, column14, column15, column16, column17];

        // 各既存カラムのインデックスを取得する
        const indexMapping = columnMapping.map(col => ({
            newName: col.newName,
            index: header.indexOf(col.oldName)
        }));

        // 必要なカラムが存在するか確認する
        for (const col of indexMapping) {
            if (col.index === -1) {
                alert(`${col.newName}に対応するカラム「${col.oldName}」が見つかりません。`);
                return;
            }
        }

        // フィルタ条件に合う異動事由コードのリストを定義する
        const validCodes = ['A51', 'A52', 'A61', 'A62', 'BE1', 'BE2', 'BF1', 'BF2'];

        // 条件に合う行を抽出する（ヘッダー行と有効な異動事由コードを含む行）
        const filteredLines = lines.filter((line, index) => {
            if (index === 0) {
                return true; // ヘッダー行を残す
            }
            const code = line[indexMapping.find(col => col.newName === '異動事由コード').index];
            return validCodes.includes(code);
        });

        // 新しいカラム名とそれに対応する既存のカラムの値をマッピングして出力
        const outputLines = filteredLines.map((line, index) => {
            if (index === 0) {
                // ヘッダー行を新しいカラム名に変換
                return columnMapping.map(col => col.newName);
            } else {
                // データ行を新しいカラム順に変換
                return indexMapping.map(col => line[col.index]);
            }
        });

        // 最終的なCSVデータを作成する
        const outputCsv = outputLines.map(line => line.join(',')).join('\n');
        return outputCsv;
    }, '帰化対象者.csv');
}

/* 11. 税情報無しの住民を含んだファイルに対し、番号連携照会結果（税情報）ファイルの値によって課税/非課税か更新をかける処理 */
function updateFukaByAtenaNumber() {
    processTwoFiles('file15', 'file16', updateheaderless, '中間ファイル⑧.csv');
}

function updateheaderless(csvText1, csvText2) {
    var lines1 = csvText1.split('\n').map(function (line) {
        return line.split(',');
    });
    var lines2 = csvText2.split('\n').map(function (line) {
        return line.split(',');
    });
    // ヘッダー行を取得
    var headers1 = lines1[0];
    // 宛名番号と課税区分のインデックスを取得
    var atenaIndex1 = headers1.indexOf('宛名番号');
    var fukaIndex1 = headers1.indexOf('課税区分');

    var atenaIndex2 = 0; // ヘッダー無しファイルの宛名番号はインデックス0
    var kazeiIndex2 = 1; // ヘッダー無しファイルの課税額はインデックス1

    // 宛名番号をキーに課税額をマップにする
    var kazeiMap = {};
    lines2.forEach(function (line) {
        kazeiMap[line[atenaIndex2].trim()] = line[kazeiIndex2].trim();
    });

    // 宛名番号に対応する課税区分を更新
    for (var i = 1; i < lines1.length; i++) {
        var atenaNumber = lines1[i][atenaIndex1].trim();
        if (kazeiMap.hasOwnProperty(atenaNumber)) {
            var kazeiValue = kazeiMap[atenaNumber];
            lines1[i][fukaIndex1] = kazeiValue === '0' ? '非課税' : (kazeiValue ? '課税対象' : '');
        }
    }

    // 更新されたCSVを文字列に戻す
    return lines1.map(function (line) {
        return line.join(',');
    }).join('\n');
}

/* 12. 税情報無しの住民を含んだファイルに対し、帰化対象者税情報確認結果ファイルをマージする */
// 2つのファイルをマージし、税区分コードを追加する関数
function taxinfo_naturalization_merge() {

    // 各ファイルのIDを配列に格納する
    const fileIds = ['file17', 'file18'];
    // document.getElementById()メソッド：HTMLのIDタグにマッチするドキュメントを取得する
    const files = fileIds.map(id => document.getElementById(id).files[0]);
    const fileName = files[0].name;
    //const fileExtension = fileName.split('.').pop().toLowerCase();

    if (fileName != '中間ファイル⑧.csv') {
        alert("「中間ファイル⑧.csv」をアップロードしてください。");
        return;
    }

    if (files.some(file => !file)) {
        alert("両方のファイルをアップロードしてください。");
        return;
    }

    // FileReaderオブジェクトを生成し、各ファイルの読み込みを行う（map処理内にFileReaderの生成を含む）
    const readers = files.map(file => new FileReader());
    const results = [];

    // 生成したFileReaderで各ファイルを読み込む
    readers.forEach((reader, index) => {
        // 各ファイルの読み込みがすべて完了したタイミングでonload処理が走る（onloadイベント）
        reader.onload = function (e) {
            // 読み込んだデータをresults配列の対応する位置に保存する
            // e.target:イベントが発生したオブジェクト（=FileReaderオブジェクト自体）
            // e.target.result:FileReaderが読み込んだファイルの内容（文字列）
            results[index] = e.target.result;

            // results配列内のデータがすべてそろったかを確認し、後続処理を行う（2はインプットファイル数）
            if (results.filter(result => result).length === 2) {
                try {
                    // 読み込んだファイル内データのマージをおこなう
                    //const mergedCSV = processCSV(...results);

                    const mergedCSV = mergeCSV_12(...results);
                    downloadCSV(mergedCSV, '中間ファイル⑨.csv');
                } catch (error) {
                    alert(error.message);
                }
            }
        };
        reader.readAsText(files[index]);
    });

    function mergeCSV_12(...csvFiles) {
        // 各CSVファイルを解体し、配列に格納する
        //const parsedCSVs = csvFiles.map(parseCSV);
        const parsedCSVs = csvFiles.map(csv => parseCSV(csv));
        // flatMap()メソッドを使用して、全てのヘッダーを取得する（重複なし）
        const fullHeader = Array.from(new Set(parsedCSVs.flatMap(parsed => parsed.header)));
        // 各CSVファイルの「宛名番号」カラムのインデックスを取得し、配列に保存する→各ファイルで「宛名番号」がどの位置にあるかを把握する
        const addressIndex = parsedCSVs.map(parsed => parsed.header.indexOf('宛名番号'));
        // 中間ファイル⑧の「課税区分」カラムのインデックスを取得し、配列に保存する
        const impositionIndex = parsedCSVs[0].header.indexOf('課税区分');

        //帰化対象者の宛名番号を取得
        for (nt_row of parsedCSVs[0].rows) {
            //帰化対象者の宛名番号
            let NFnaturalization_target_num = nt_row[addressIndex[1]];

            for (m_row of parsedCSVs[0].rows) {
                let middle_file_num = m_row[addressIndex[0]];
            }
        }
        //中間ファイル⑧の宛名番号を取得
        //filterメソッドを使って重複しない宛名番号を取得
        //logger.error（'宛名番号が存在しません。宛名番号：'+重複しない宛名番号）;となるようにエラー表示


        // 手順1：帰化対象者ファイルのaddressIndexの「宛名番号」列の値を読み取り、配列化
        //配列の行の分だけループを回す
        for (nt_row of parsedCSVs[1].rows) {
            // 帰化対象者の宛名番号
            let naturalization_target_num = nt_row[addressIndex[1]];

            // 手順2：中間ファイルの「宛名番号」列を手順1で取得した値で検索し、
            for (m_row of parsedCSVs[0].rows) {
                let middle_file_num = m_row[addressIndex[0]];// 中間ファイルの「宛名番号」
                if (naturalization_target_num == middle_file_num) {
                    //「課税区分」列の値を読み取り
                    let taxation_information = m_row[impositionIndex];
                    let taxation_information_code = "";
                    //　21行目の課税区分が「課税対象」なら0、「非課税」なら1、「均等割りのみ課税」なら2に変換
                    if (taxation_information === "課税対象") {
                        taxation_information_code = 0;
                    } else if (taxation_information === "非課税") {
                        taxation_information_code = 1;
                    } else if (taxation_information === "均等割りのみ課税") {
                        taxation_information_code = 2;
                    } else if (taxation_information === "") {
                        taxation_information_code = "";
                    } else {
                        logger.error('課税区分が不正です。課税区分：' + taxation_information);
                        return;
                    }

                    // 「課税区分」の列を削除す
                    m_row.splice(impositionIndex, 1);
                    m_row.push(taxation_information_code);



                    console.log("削除前のCSVデータ:", parsedCSVs[0].rows);// 削除前のCSVデータ


                    //18行目に「税区分」列を追加

                    //税区分列に全ステップで変換した課税区分を出力する

                }
            }
        }
        //ヘッダーから課税区分を消す
        parsedCSVs[0].header.splice(impositionIndex, 1);
        parsedCSVs[0].header.push("税区分");

        // 出力用のCSVデータを生成する
        const output = [parsedCSVs[0].header.join(',')];
        for (output_row of parsedCSVs[0].rows) {
            output.push(output_row.join(','));
        }

        return output.join('\n');
    }

}

/* 13.課税対象の住民を除外する処理 */
function ExcludedFromTaxation() {
    processSingleFile('file19', filterTaxExcluded, '中間ファイル⑩.csv');
}

/* 14.税情報無しの住民を除外する処理 */
function ExcludeNoTaxInfo() {
    // CSVの数が1つの時の汎用処理を呼び出す（引数：①CSVファイルのID ②コールバック関数 ③出力するファイル名）
    processSingleFile('file20', text => {
        const lines = text.split('\n').map(line => line.split(','));
        const headerIndex = lines[0].indexOf('課税区分');
        if (headerIndex === -1) {
            alert('課税区分列が見つかりません。');
            return;
        }
        // filter処理を実施し、indexが0（要するにヘッダー行）と、「課税区分」が「（課税対象のコード）」ではない行を抽出する
        const filteredLines = lines.filter((line, index) => index === 0 || line[headerIndex] !== '');
        // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
        return filteredLines.map(line => line.join(',')).join('\n');
    }, '中間ファイル⑪.csv');
}

/* 15. 「均等割りのみ課税」「非課税」対象者ファイル（固定長形式）を出力する処理（形式は「税情報無し対象者」リストと同じ） */
function generateTargetGroupFile() {
    processSingleFile('file21', generateFixedLengthFile, '「「均等割りのみ課税」「非課税」対象者.csv');
}

/* 16. 住基照会用ファイル②を出力する処理 */
/* 税情報無しの住民を抽出し、「宛名番号,住民票コード」の構成に整形する */
function generateCitizenIDcheckFile2() {
    processSingleFile('file22', text => {
        const lines = text.split('\n').map(line => line.split(','));
        const header = lines[0];
        const headerIndex = header.indexOf('課税区分');

        if (headerIndex === -1) {
            alert('課税区分列が見つかりません。');
            return;
        }

        // 「宛名番号」と「住民票コード」のインデックスを取得
        const indexA = header.indexOf('宛名番号');
        const indexB = header.indexOf('住民票コード');

        if (indexA === -1 || indexB === -1) {
            alert('宛名番号または住民票コード列が見つかりません。');
            return;
        }

        // filter処理を実施し、indexが0（要するにヘッダー行）と、「課税区分」が空の行をフィルタリング
        const filteredLines = lines.filter((line, index) => index === 0 || line[headerIndex] == '');
        // フィルタリングされた行から、宛名番号列と住民票コード列のみを抽出
        const extractedLines = filteredLines.map(line => [line[indexA], line[indexB]]);
        // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
        return extractedLines.map(line => line.join(',')).join('\n');
    }, '住基照会用ファイル②.csv');
}

/* 以下、使いまわすメソッド（汎用処理）ここから */

/**
 * 必要なファイルがすべてアップロードされているかのチェック
 * @param {string[]} fileIds 入力ファイル名の1次元配列
 * @returns {{ check: boolean, file_num: number, files: object }} チェック結果のオブジェクト
 * @property {boolean} check - チェック結果
 * @property {number} file_num - 理論ファイル数
 * @property {object} files - ファイルオブジェクト
 */
function fileCheck(fileIds) {
    let check = false;
    // 読み込むファイル数
    const file_num = fileIds.length;
    // document.getElementById()メソッド：HTMLのIDタグにマッチするドキュメントを取得する
    const files = fileIds.map(id => document.getElementById(id).files[0]);

    // ファイル数のチェック
    if (files.some(file => !file)) {
        alert("すべて( " + file_num + "個 )のファイルをアップロードしてください。");
    }
    else {
        check = true;
    }
    return { check, file_num, files };
}

/* 単一ファイル処理の汎用関数 */
function processSingleFile(fileId, processFunc, outputFilename) {
    const file = document.getElementById(fileId).files[0];
    if (!file) {
        alert("CSVファイルをアップロードしてください。");
        return;
    }
    const reader = new FileReader();
    // 読み込んだデータをresults配列の対応する位置に保存する
    // e.target.result:FileReaderが読み込んだファイルの内容（文字列）
    reader.onload = function (e) {
        const processedText = processFunc(e.target.result);
        if (processedText) {
            downloadCSV(processedText, outputFilename);
        }
    };
    reader.readAsText(file);
}

/* 二つのファイル処理の汎用関数 */
function processTwoFiles(fileId1, fileId2, processFunc, outputFilename) {
    const file1 = document.getElementById(fileId1).files[0];
    const file2 = document.getElementById(fileId2).files[0];

    if (!file1 || !file2) {
        alert("2つのCSVファイルをアップロードしてください。");
        return;
    }

    const reader1 = new FileReader();
    const reader2 = new FileReader();

    let text1, text2;

    reader1.onload = function (e) {
        text1 = e.target.result;
        if (text2) {
            const processedText = processFunc(text1, text2);
            if (processedText) {
                downloadCSV(processedText, outputFilename);
            }
        }
    };

    reader2.onload = function (e) {
        text2 = e.target.result;
        if (text1) {
            const processedText = processFunc(text1, text2);
            if (processedText) {
                downloadCSV(processedText, outputFilename);
            }
        }
    };

    reader1.readAsText(file1);
    reader2.readAsText(file2);
}

/**
 * 課税対象の住民を除外する関数
 * @param {string} text csvファイルのデータを文字列化して入力
 * @return {string} 課税対象の住民を除外したcsvcsvファイルのデータを文字列化して出力
 */
function filterTaxExcluded(text) {
    const lines = text.split('\n').map(line => line.split(','));
    const headerIndex = lines[0].indexOf('課税区分');
    if (headerIndex === -1) {
        throw ('課税区分列が見つかりません。');
    }
    // filter処理を実施し、indexが0（要するにヘッダー行）と、「課税区分」が「課税対象」ではない行を抽出する
    const filteredLines = lines.filter((line, index) => index === 0 || line[headerIndex] !== '課税対象');
    // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
    return filteredLines.map(line => line.join(',')).join('\n');
}

/**
 * CSVファイルのダウンロード処理
 * @param {string} content csvファイルのデータを文字列化して入力
 * @param {string} filename 出力するファイルのファイル名
 */
function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * ヘッダーの文字から前方一致で任意の文字列を削除する
 * @param {array} header 1次元配列形式でヘッダーを入力
 * @param {string} deleteStr 削除する文字列
 */
function removeStrFromHeader(header, deleteStr) {
    const delRegex = new RegExp("^" + deleteStr);
    return header.map(col => col.replace(delRegex, ''));
}

/**
 * 各CSV（DAT）ファイルをヘッダーとデータ行に分解し、1行ずつ配列に格納する
 * @param {String} text FileReaderが読み込んだファイル文字列（e.target.result）
 */
function parseCSV(text) {
    const [header, ...rows] = text
        .split('\n')                // split()メソッドを使用して、CSVファイルの行を'\n'（改行）単位で分解
        .map(line => line.trim())   // 各行の前後に空白文字がある場合削除
        .filter(line => line)       // 空行がある場合削除
        .map(line => {
            return line.split(',').map(field => {           // 各行をカンマ , で分割してフィールドに分ける
                return field.replace(/^"|"$/g, '').trim();  //各フィールドの前後に引用符（"）がある場合削除し、前後の空白も削除
            });
        });
    // CSVファイルをヘッダー・各行で分けてobjectとして返す
    return { header: header, rows: rows.map(row => row) };
}

/* 使いまわすメソッド（汎用処理）ここまで */

// ログ出力クラス
class Logger {
    constructor(level = 'info', logContainerId = 'log-box') {
        this.levels = ['debug', 'info', 'warn', 'error'];
        this.level = level;
        this.logContainer = document.getElementById(logContainerId);
    }

    // 現在時刻を取得
    getCurrentTime() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    // ログレベル・時刻・メッセージを結合
    log(level, message) {
        if (this.levels.indexOf(level) >= this.levels.indexOf(this.level)) {
            const timestamp = this.getCurrentTime();
            const logMessage = `[${timestamp}] [${level.toUpperCase()}] \n${message}`;
            this.appendLog(logMessage, level);
        }
    }

    // 作成したログをHTML上にセットする
    appendLog(message, level) {
        const logEntry = document.createElement('div');
        logEntry.textContent = message;
        logEntry.classList.add(`log-${level}`);
        this.logContainer.appendChild(logEntry);
        this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    debug(message) {
        this.log('debug', message);
    }

    info(message) {
        this.log('info', message);
    }

    warn(message) {
        this.log('warn', message);
    }

    error(message) {
        this.log('error', message);
    }
}

// ログ出力クラスのインスタンス化
var logger = new Logger(LOG_LEVEL); // 引数以上のレベルのログのみを出力します（infoの場合、debugログは出力されない）
