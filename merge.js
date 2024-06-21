/* 定数定義 */
const LOG_LEVEL = 'debug'; // Log出力のレベルを選択（debug, info, warn, error）
const MIDDLE_FILE_0 = "中間ファイル⓪.csv";
const MIDDLE_FILE_1 = "中間ファイル①.csv";
const MIDDLE_FILE_2 = "中間ファイル②.csv";
const MIDDLE_FILE_3 = "中間ファイル③.csv";
const MIDDLE_FILE_4 = "中間ファイル④.csv";
const MIDDLE_FILE_5 = "中間ファイル⑤.csv";
const NO_TAXINFO_FILE = "「税情報なし」対象者.DAT";
const RESIDENTINFO_INQUIRY_FILE_1 = "住基照会用ファイル①.csv";
const NATURALIZED_CITIZEN_FILE = '帰化対象者.csv';

/* 0.課税区分を判定するために賦課マスタ・個人基本マスタをマージする処理 */
function mergeTaxCSV() {
    // 各ファイルのIDを配列に格納する
    const fileIds = ['LevyMaster', 'PersonalMaster'];
    // 各ファイルのIDを配列に格納する
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」で終わらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('STEP 0 処理を開始しました');
    //showLoading();

    // map処理でファイル分のFileReaderオブジェクトを生成し、ファイルの読み込みを行う
    const readers = files.map(file => new FileReader());
    const results = [];

    // 各ファイルを順に読み込み、読み込みが完了したタイミングでonload処理が走る（onloadイベント）
    readers.forEach((reader, index) => {
        reader.onload = function (e) {
            results[index] = e.target.result;

            // results配列内のデータがすべてそろったかを確認し、後続処理を行う
            if (results.filter(result => result).length === file_num) {
                try {
                    // 読み込んだファイル内データのマージをおこなう
                    const mergedCSV = ProcessingDataTakenFromCSV(...results);
                    downloadCSV(mergedCSV, MIDDLE_FILE_0);
                } catch (error) {
                    // catchしたエラーを表示
                    logger.error(error);
                } finally {
                    logger.info('STEP 0 処理を終了しました');
                    // hideLoading();
                }
            }
        };
        reader.readAsText(files[index]);
    });

    function ProcessingDataTakenFromCSV(...csvFiles) {
        // 各CSVファイルをヘッダーとデータ行に分解し、1行ずつ配列に格納する
        const parsedCSVs = csvFiles.map(csv => parseCSV(csv));

        // 各ファイルヘッダー内の「ＦＩ－」を取り除く
        parsedCSVs.forEach(parsed => parsed.header = removeStrFromHeader(parsed.header, "ＦＩ－"));
        // 各CSVファイルの「宛名番号」カラムのインデックスを取得し、配列に保存する→各ファイルで「宛名番号」がどの位置にあるかを把握する
        const addressIndex = parsedCSVs.map(parsed => parsed.header.indexOf('宛名番号'));

        // 1つ目のCSVデータを基準にマッピングしマージ処理を行う
        const map = new Map();
        parsedCSVs[0].rows.forEach(row => {
            const addressNumber = row[addressIndex[0]];
            // headersとrowからオブジェクトを生成する
            const rowObj = parsedCSVs[0].header.reduce((obj, header, i) => {
                obj[header] = row[i];
                return obj;
            }, {});
            map.set(addressNumber, rowObj);
        });

        // 住基情報に存在しない宛名番号を格納する変数
        let nonExistingAddresseeNumber = [];
        let nonExistingAddresseeNumberMap = new Map();
        // 他のCSVデータをマッピングしマージ処理を行う
        for (let fileIndex = 1; fileIndex < parsedCSVs.length; fileIndex++) {
            parsedCSVs[fileIndex].rows.forEach(row => {
                const addressNumber = row[addressIndex[fileIndex]];
                if (map.has(addressNumber)) {
                    // headersとrowからオブジェクトを生成する
                    const rowObj = parsedCSVs[fileIndex].header.reduce((obj, header, i) => {
                        obj[header] = row[i];
                        return obj;
                    }, {});
                    map.set(addressNumber, { ...map.get(addressNumber), ...rowObj });
                } else {
                    nonExistingAddresseeNumberMap.set(addressNumber, addressNumber);
                }
            });
        }

        nonExistingAddresseeNumberMap.forEach(function (value, key) {
            nonExistingAddresseeNumber.push(value);
        });
        // 住基情報に存在しない宛名番号を表示
        if (nonExistingAddresseeNumber.length > 0) {
            logger.warn("個人基本マスタに存在するが、賦課マスタに存在しない宛名番号が検出されました。\n件数："+nonExistingAddresseeNumber.length);
            downloadCSV(nonExistingAddresseeNumber.join('\r\n'), "個人基本マスタに存在するが、賦課マスタに存在しない宛名番号.csv");
        }
        /* 0618_住基情報以外の行を無視しない処理（旧処理）。確認が取れ次第削除する
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
        });*/

        // 条件ごとに課税区分を入力する
        map.forEach((value) => {
            // 条件分岐に使用するカラムの値を定義する
            const incomePercentage = Number(value['所得割額']);
            const equalPercentage = Number(value['均等割額']);
            const causeForCorrection = String(value['更正事由']);
            // 「所得割額」が0かつ、「均等割額」が0かつ、「更正事由」の先頭２桁が03でないものを非課税(1)判定
            if (incomePercentage == 0 && equalPercentage == 0 && !causeForCorrection.startsWith("03")) {
                value['課税区分'] = '1';
                // 「所得割額」が0かつ、「均等割額」が1以上かつ、「更正事由」の先頭２桁が03でないものを均等割りのみ課税(2)判定
            } else if (incomePercentage == 0 && equalPercentage > 0 && !causeForCorrection.startsWith("03")) {
                value['課税区分'] = '2';
                // 「所得割額」が1以上かつ、「均等割額」が1以上かつ、「更正事由」の先頭２桁が03でないものを課税(3)判定
            } else if (incomePercentage > 0 && equalPercentage > 0 && !causeForCorrection.startsWith("03")) {
                value['課税区分'] = '3';
                // 「所得割額」が1以上のときは「均等割額」が1以上になるはずのため、「均等割額」が0のものはエラーとして投げる
            } else if (incomePercentage > 0 && equalPercentage == 0 && !causeForCorrection.startsWith("03")) {
                throw new Error('【宛名番号：' + String(value['宛名番号']) + 'の課税情報】\n「所得割額」が1以上ですが「均等割額」が0となっております。インプットファイルを確認してください。')
                // 「更正事由」の先頭２桁が03であるものは、「所得割額」「所得割額」に関わらず未申告(4)判定
            } else if (causeForCorrection.startsWith("03")) {
                value['課税区分'] = '4';
            } else {
                value['課税区分'] = '';
            }
        });

        // アウトプットファイルのカラムを指定する
        const selectedColumns = ['宛名番号', '所得割額', '均等割額', '課税区分', '更正事由', '生年月日'];
        const outputHeader = selectedColumns.join(',');

        const outputRows = [];
        map.forEach(value => {
            const row = selectedColumns.map(header => value[header] || '');
            outputRows.push(row.join(','));
        });

        const output = [outputHeader, ...outputRows];
        return output.join('\r\n') + '\r\n';
    }
}

/* 1.住基情報・税情報・住民票コード・前住所地の住所コードをマージする大元の処理 */
function mergeCSV() {
    // 各ファイルのIDを配列に格納する
    const fileIds = ['file1', 'file2', 'file3', 'file4'];
    // 各ファイルのIDを配列に格納する
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」で終わらない場合はエラーを出して処理終了
    }
    
    // 税情報ファイルとして、「中間ファイル⓪」がインプットされたことを確認する（前方一致で確認）
    if (!files[1].name.startsWith('中間ファイル⓪')) {
        alert('税情報ファイルとしてアップロードするファイル名は「中間ファイル⓪.csv」にして下さい。');
        return; // ファイル名が「中間ファイル⓪」で始まらない場合はエラーを出して処理終了
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
        // 出力用のCSVデータを定義する
        const output = [fullHeader.join(',')];

        // 1つ目のファイル（住基情報）を基準にマッピングしマージ処理を行う
        const map = new Map();
        parsedCSVs[0].rows.forEach(row => {
            const addressNumber = row[addressIndex[0]];
            // headersとrowからオブジェクトを生成する
            const rowObj = parsedCSVs[0].header.reduce((obj, header, i) => {
                obj[header] = row[i];
                return obj;
            }, {});
            map.set(addressNumber, rowObj);
        });

        // 住基情報に存在しない宛名番号を格納する変数 //
        // 1:税情
        // 2.住民票コード、
        // 3.前住所地の住所コード
        let nonExistingAddresseeNumber1 = [];
        let nonExistingAddresseeNumberMap1 = new Map();
        let nonExistingAddresseeNumber2 = [];
        let nonExistingAddresseeNumberMap2 = new Map();
        let nonExistingAddresseeNumber3 = [];
        let nonExistingAddresseeNumberMap3 = new Map();
        // 他のCSVデータをマッピングしマージ処理を行う
        for (let fileIndex = 1; fileIndex < parsedCSVs.length; fileIndex++) {
            parsedCSVs[fileIndex].rows.forEach(row => {
                const addressNumber = row[addressIndex[fileIndex]];
                if (map.has(addressNumber)) {
                    // headersとrowからオブジェクトを生成する
                    const rowObj = parsedCSVs[fileIndex].header.reduce((obj, header, i) => {
                        obj[header] = row[i];
                        return obj;
                    }, {});
                    map.set(addressNumber, { ...map.get(addressNumber), ...rowObj });
                } else {
                    if(fileIndex==1){
                        nonExistingAddresseeNumberMap1.set(addressNumber, addressNumber);
                    }else if(fileIndex==2){
                        nonExistingAddresseeNumberMap2.set(addressNumber, addressNumber);
                    }else if(fileIndex==3){
                        nonExistingAddresseeNumberMap3.set(addressNumber, addressNumber);
                    }
                        
                }
            });
        }
        nonExistingAddresseeNumberMap1.forEach(function (value, key) {
            nonExistingAddresseeNumber1.push(value);
        });
        nonExistingAddresseeNumberMap2.forEach(function (value, key) {
            nonExistingAddresseeNumber2.push(value);
        });
        nonExistingAddresseeNumberMap3.forEach(function (value, key) {
            nonExistingAddresseeNumber3.push(value);
        });
        // 住基情報に存在しない宛名番号を表示
        if (nonExistingAddresseeNumber1.length > 0) {
            logger.warn("税情報に存在するが、住基情報に存在しない宛名番号が検出されました。\n件数："+nonExistingAddresseeNumber1.length);
            downloadCSV(nonExistingAddresseeNumber1.join('\r\n'), "税情報に存在するが、住基情報に存在しない宛名番号.csv");
        }
        if (nonExistingAddresseeNumber2.length > 0) {
            logger.warn("住民票コードに存在するが、住基情報に存在しない宛名番号が検出されました。\n件数："+nonExistingAddresseeNumber2.length);
            downloadCSV(nonExistingAddresseeNumber2.join('\r\n'), "住民票コードに存在するが、住基情報に存在しない宛名番号.csv");
        }
        if (nonExistingAddresseeNumber3.length > 0) {
            logger.warn("前住所地の住所コードに存在するが、住基情報に存在しない宛名番号が検出されました。\n件数："+nonExistingAddresseeNumber3.length);
            downloadCSV(nonExistingAddresseeNumber3.join('\r\n'), "前住所地の住所コードに存在するが、住基情報に存在しない宛名番号.csv");
        }
        /* 0618_住基情報以外の行を無視しない処理（旧処理）。確認が取れ次第削除する
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
        }); */

        map.forEach(value => {
            const row = fullHeader.map(header => value[header] || '');
            output.push(row.join(','));
        });
        return output.join('\r\n') + '\r\n';
    }
}

/* 2.課税対象の住民を除外する処理・消除者を除外する処理・住民日がR6.6.4~の住民を除外する処理 */
function handleFile() {
    // 各ファイルのIDを配列に格納する
    const fileIds = ['midFile1'];
    // 各ファイルのIDを配列に格納する
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」で終わらない場合はエラーを出して処理終了
    }

    // 「中間ファイル①」がインプットされたことを確認する（前方一致で確認）
    if (!files[0].name.startsWith('中間ファイル①')) {
        alert('アップロードするファイル名を「中間ファイル①」から始まるものにして下さい。');
        return; // ファイル名が「中間ファイル①」で始まらない場合はエラーを出して処理終了
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
            const { header, rows } = parseCSV(text);
            const requiredColumns = [
                '消除日',
                '消除事由コード',
                '住民日',
                '続柄１',
                '宛名番号',
                '世帯番号',
                '課税区分'
            ];
            // カラムのインデックスを取得
            const columnIndices = requiredColumns.map(col => header.indexOf(col));
            // 足りないカラムをチェック
            const missingColumns = requiredColumns.filter((col, index) => columnIndices[index] === -1);

            if (missingColumns.length > 0) {
                throw new Error(`次の列が見つかりませんでした： ${missingColumns.join(', ')}\nファイルを確認してください。`);
            }

            // 課税対象の住民を除外する処理
            const filterTaxExcludedText = filterTaxExcluded(text);
            if (!filterTaxExcludedText) {
                logger.warn("出力対象レコードが存在しませんでした。");
            } else {
                //消除住民を除外する処理・住民日がR6.6.4~の住民を除外する処理
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

    /* 消除世帯を除外する処理・世帯主の住民日がR6.6.4~の世帯を除外する処理 */
    /* 上記条件で対象世帯主を抽出・世帯番号を取得し世帯員のレコードをすべて除外する */
    function filterDeath(text, columnIndices) {
        // ヘッダーとレコード行に分割
        const { header, rows } = parseCSV(text);
        // 日付比較用に、20240604をdate型にする
        const targetDate = new Date('2024-06-04 00:00:00');
        // 死亡による全員消除判定用の消除事由コード（これに含まれていると除外対象になる）
        const deathReasonCode = ['B12', 'B22'];
        // 死亡以外による全員消除判定用の消除事由コード（これに含まれているかつ消除日がR6.6.4以降だと除外対象になる）
        const nonDeathReasonCode = ['B02', 'B32', 'B42', 'B52', 'B62', 'B72', 'BD2', 'BE2', 'BF2', 'BL2', 'BM2'];
        // 死亡による全員消除判定用の消除事由コード（これに含まれている世帯主がいる場合、世帯は未申告扱いになる）
        const partOfDeathReasonCode = ['B11', 'B21'];
        // 死亡以外による全員消除判定用の消除事由コード（これに含まれている世帯主がいるかつ消除日がR6.6.4以前の場合、世帯は未申告扱いになる）
        const partOfNonDeathReasonCode = ['B01', 'B31', 'B41', 'B51', 'B61', 'B71', 'BD1', 'BE1', 'BF1', 'BL1', 'BM1'];
        // 除外対象の世帯番号の値を収集するためのセット
        const excludedHouseholdNumSet = new Set();

        // 一次フィルター：除外対象の世帯主レコードを取得する
        rows.forEach(line => {
            const [removalDate, reasonCode, residentsdate, familyRelationship] = [
                line[columnIndices[0]],
                line[columnIndices[1]],
                line[columnIndices[2]],
                line[columnIndices[3]],
            ];

            // 住民日が空だと日付比較が出来ないため、存在有無を確認する
            if (!residentsdate) {
                throw new Error('【宛名番号：' + line[columnIndices[4]] + '】\n「住民日」列が空です。インプットファイルの確認をお願いします。');
            }

            // 住民日・消除日を日付型に変換する。どちらも「yyyymmdd」形式（8桁）で入力されているので、「parseDate」で一度分割して「年,月,日」の形式にしてからDate型に変換する
            const residentsDateObj = parseDate(residentsdate);
            const removalDateObj = parseDate(removalDate);

            function parseDate(yyyymmdd) {
                const year = yyyymmdd.substring(0, 4);
                const month = yyyymmdd.substring(4, 6) - 1;
                const day = yyyymmdd.substring(6, 8);
                return new Date(year, month, day);
            }

            // 除外条件がわかりづらいため変数として定義する
            // 続柄が「02（世帯主）」かつ、住民日がR6.6.3よりあとであるレコード
            const condition1 = familyRelationship === '02' && residentsDateObj >= targetDate;
            // 消除事由が「「死亡申出（全部）」「死亡通知（全部）」のいずれかであるレコード
            const condition2 = deathReasonCode.includes(reasonCode);
            // 消除事由が、死亡以外の「～（全部）」いずれかで、かつ消除日がR6.6.3より前であるレコード
            const condition3 = nonDeathReasonCode.includes(reasonCode) && removalDateObj < targetDate;

            // 抽出判定を実施する
            const judge = condition1 || condition2 || condition3;

            // 除外対象となる世帯番号を収集する
            if (judge) {
                excludedHouseholdNumSet.add(line[columnIndices[5]]);
            }
        });

        // 二次フィルター：一次フィルターで取得した除外対象の世帯番号を使用し、対象外世帯の世帯員レコードを全て除外する
        const secondaryFilteredLines = rows.filter(line => {
            const householdNum = line[columnIndices[5]];
            return !excludedHouseholdNumSet.has(householdNum);
        });

        // 三次フィルター：世帯主が死亡、または他の消除をしている世帯を抽出し、申請書の対象とする（＝課税区分を「4」にする）
        const finalFilteredLines = secondaryFilteredLines.map(line => {
            const [removalDate, reasonCode, familyRelationship] = [
                line[columnIndices[0]],
                line[columnIndices[1]],
                line[columnIndices[3]],
            ];

            // 消除日を日付型に変換する。どちらも「yyyymmdd」形式（8桁）で入力されているので、「parseDate」で一度分割して「年,月,日」の形式にしてからDate型に変換する
            const removalDateObj = parseDate(removalDate);

            function parseDate(yyyymmdd) {
                const year = yyyymmdd.substring(0, 4);
                const month = yyyymmdd.substring(4, 6) - 1;
                const day = yyyymmdd.substring(6, 8);
                return new Date(year, month, day);
            }

            // 続柄が「02（世帯主）」かつ、消除事由が「「死亡申出（一部）」「死亡通知（一部）」のいずれかであるレコード
            const condition1 = familyRelationship === '02' && partOfDeathReasonCode.includes(reasonCode);
            // 続柄が「02（世帯主）」かつ、消除事由が死亡以外の「～（一部）」のいずれかかつ、消除日がR6.6.3より前であるレコード
            const condition2 = familyRelationship === '02' && partOfNonDeathReasonCode.includes(reasonCode) && removalDateObj < targetDate;

            // 抽出判定を実施する
            const judge = condition1 || condition2

            // 除外対象となる世帯番号を収集する
            if (judge) {
                line[columnIndices[6]] = '4';
            }

            return line;
        });

        return [header.join(','), ...finalFilteredLines.map(line => line.join(','))].join('\r\n');
    }
}

/* 3.R5給付対象者を、宛名番号・世帯番号をキーとして除外する処理 */
function deleteRowsByAddressNumber() {
    const fileIds = ['file5', 'file6'];
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」で終わらない場合はエラーを出して処理終了
    }

    // 「中間ファイル②」がインプットされたことを確認する（前方一致で確認）
    if (!files[0].name.startsWith('中間ファイル②')) {
        alert('アップロードするファイル名を「中間ファイル②」から始まるものにして下さい。');
        return; // ファイル名が「中間ファイル②」で始まらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('STEP 3 処理を開始しました');

    // map処理でファイル分のFileReaderオブジェクトを生成し、ファイルの読み込みを行う
    const readers = files.map(file => new FileReader());
    const results = [];

    // 各ファイルを順に読み込み、読み込みが完了したタイミングでonload処理が走る（onloadイベント）
    readers.forEach((reader, index) => {
        reader.onload = function (e) {
            results[index] = e.target.result;

            // results配列内のデータがすべてそろったかを確認し、後続処理を行う
            if (results.filter(result => result).length === file_num) {
                try {
                    const mergedCSV = deleteRows(results[0], results[1], ['宛名番号', '世帯番号']);
                    downloadCSV(mergedCSV, MIDDLE_FILE_3);
                } catch (error) {
                    // catchしたエラーを表示
                    logger.error(error);
                } finally {
                    logger.info('STEP 3 処理を終了しました');
                }
            }
        };
        reader.readAsText(files[index]);
    });

    function deleteRows(csvText1, csvText2, keys) {
        // CSVテキストを行ごとに分割して配列に変換
        const arrayFromMidFile = parseCSV(csvText1);
        const arrayFromR5BeneficiaryList = parseCSV(csvText2);

        // ヘッダー行を取得
        const midFileHeader = arrayFromMidFile.header;
        const r5BeneficiaryListHeader = arrayFromR5BeneficiaryList.header;

        // 各キーのインデックスを取得
        const addressNumIndex1 = midFileHeader.indexOf(keys[0]); // 宛名番号のインデックス（中間ファイル②）
        const householdNumIndex1 = midFileHeader.indexOf(keys[1]); // 世帯番号のインデックス（中間ファイル②）
        const addressNumIndex2 = r5BeneficiaryListHeader.indexOf(keys[0]); // 宛名番号のインデックス（R5給付対象者ファイル）
        const householdNumIndex2 = r5BeneficiaryListHeader.indexOf(keys[1]); // 世帯番号のインデックス（R5給付対象者ファイル）


        // エラーハンドリング（必要なカラムが存在しない場合、ファイル名とカラムを表示する）
        const missingColumns = [];
        if (addressNumIndex1 === -1) {
            missingColumns.push('■ファイル名：' + files[0].name + ' >> 不足カラム名：' + keys[0]);
        }
        if (householdNumIndex1 === -1) {
            missingColumns.push('■ファイル名：' + files[0].name + ' >> 不足カラム名：' + keys[1]);
        }
        if (addressNumIndex2 === -1) {
            missingColumns.push('■ファイル名：' + files[1].name + ' >> 不足カラム名：' + keys[0]);
        }
        if (householdNumIndex2 === -1) {
            missingColumns.push('■ファイル名：' + files[1].name + ' >> 不足カラム名：' + keys[1]);
        }

        if (missingColumns.length > 0) {
            throw new Error('以下のカラムが見つかりません。ファイルの確認をお願いします。\n' + missingColumns.join('\n'));
        }

        // 一次フィルター：除外対象の住民レコードを、宛名番号をキーにして取得する
        // R5給付対象者のCSVファイルの宛名番号セットを作成する
        const addressNumberSet = new Set(arrayFromR5BeneficiaryList.rows.map(line => line[addressNumIndex2].trim()));
        // 除外対象の世帯番号の値を収集するためのセットを作成する
        const excludedHouseholdNumSet = new Set();

        // 中間ファイルから、宛名番号セット内の値と一致する宛名番号を持つ行（除外対象行）を抽出する
        const primaryFilteredLines = arrayFromMidFile.rows.filter((line) => {
            const addressNumber = line[addressNumIndex1].trim();
            const judge = addressNumberSet.has(addressNumber);

            // 中間ファイルから、除外対象となる世帯番号の値を収集する
            if (judge) {
                excludedHouseholdNumSet.add(line[householdNumIndex1]);
            }

            return judge;
        });

        // 二次フィルター：一次フィルターで取得した除外対象の世帯番号を使用し、対象外世帯の世帯員レコードを全て除外する
        const secondaryFilteredLines = arrayFromMidFile.rows.filter(line => {
            const householdNum = line[householdNumIndex1].trim();
            return !excludedHouseholdNumSet.has(householdNum);
        });

        // フィルタリングされた行をCSV形式に戻す
        return [midFileHeader, ...secondaryFilteredLines].map(line => line.join(',')).join('\r\n') + '\r\n';
    }
}

/* 4.廃止事由ファイル内「廃止理由」が「18(他区課税)」の行を除外し、「21(非居住海外)」の行を「未申告」とする（給付対象とする）処理 */
function deleteRowsByReason() {
    const fileIds = ['file7', 'file8'];
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」で終わらない場合はエラーを出して処理終了
    }

    // 「中間ファイル②」がインプットされたことを確認する（前方一致で確認）
    if (!files[0].name.startsWith('中間ファイル③')) {
        alert('アップロードするファイル名を「中間ファイル③」から始まるものにして下さい。');
        return; // ファイル名が「中間ファイル③」で始まらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('STEP 4 処理を開始しました');

    // map処理でファイル分のFileReaderオブジェクトを生成し、ファイルの読み込みを行う
    const readers = files.map(file => new FileReader());
    const results = [];

    // 各ファイルを順に読み込み、読み込みが完了したタイミングでonload処理が走る（onloadイベント）
    readers.forEach((reader, index) => {
        reader.onload = function (e) {
            results[index] = e.target.result;

            // results配列内のデータがすべてそろったかを確認し、後続処理を行う
            if (results.filter(result => result).length === file_num) {
                try {
                    const mergedCSV = filterByReason(results[0], results[1]);
                    downloadCSV(mergedCSV, MIDDLE_FILE_4);
                } catch (error) {
                    // catchしたエラーを表示
                    logger.error(error);
                } finally {
                    logger.info('STEP 4 処理を終了しました');
                }
            }
        };
        reader.readAsText(files[index]);
    });

    function filterByReason(csvText1, csvText2) {
        // CSVテキストを行ごとに分割して配列に変換
        const arrayFromMidFile = parseCSV(csvText1);
        const arrayFromReasonForAbolitionList = parseCSV(csvText2);

        // ヘッダー行を取得
        const midFileHeader = arrayFromMidFile.header;
        const reasonForAbolitionheader = arrayFromReasonForAbolitionList.header;

        // 必要な列のインデックスを取得
        const addressNumIndex1 = midFileHeader.indexOf('宛名番号');
        const taxClassIndex = midFileHeader.indexOf('課税区分');
        const addressNumIndex2 = reasonForAbolitionheader.indexOf('宛名番号');
        const reasonIndex = reasonForAbolitionheader.indexOf('廃止理由');

        // エラーハンドリング（必要なカラムが存在しない場合、ファイル名とカラムを表示する）
        const missingColumns = [];
        if (addressNumIndex1 === -1) {
            missingColumns.push('■ファイル名：' + files[0].name + ' >> 不足カラム名：宛名番号');
        }
        if (taxClassIndex === -1) {
            missingColumns.push('■ファイル名：' + files[0].name + ' >> 不足カラム名：課税区分');
        }
        if (addressNumIndex2 === -1) {
            missingColumns.push('■ファイル名：' + files[1].name + ' >> 不足カラム名：宛名番号');
        }
        if (reasonIndex === -1) {
            missingColumns.push('■ファイル名：' + files[1].name + ' >> 不足カラム名：廃止理由');
        }

        if (missingColumns.length > 0) {
            throw new Error('以下のカラムが見つかりません。ファイルの確認をお願いします。\n' + missingColumns.join('\n'));
        }

        // arrayFromReasonForAbolitionList内の、廃止理由が「18」である行の宛名番号をセットに格納
        const keySetFor18 = new Set(arrayFromReasonForAbolitionList.rows
            .filter(line => line[reasonIndex].trim() === '18')
            .map(line => line[addressNumIndex2].trim())
        );

        // arrayFromReasonForAbolitionList内の、廃止理由が「21」である行の宛名番号をマップに格納
        const keyMapFor21 = new Map(arrayFromReasonForAbolitionList.rows
            .filter(line => line[reasonIndex].trim() === '21')
            .map(line => [line[addressNumIndex2].trim(), line])
        );

        const filteredRows = arrayFromMidFile.rows.filter(line => {
            const addressNum = line[addressNumIndex1].trim();
            if (keySetFor18.has(addressNum)) {
                // 廃止理由が「18」の場合、行を削除する
                return false;
            } else if (keyMapFor21.has(addressNum)) {
                // 廃止理由が「21」の場合、課税区分カラムの値を「未申告(4)」に更新する
                line[taxClassIndex] = '4';
            }
            return true;
        });

        // フィルタリングされた行をCSV形式に戻す
        return [midFileHeader, ...filteredRows].map(line => line.join(',')).join('\r\n') + '\r\n';
    }
}

/* 5.「情報提供者機関コード」カラムを追加し、「前住所コード」をもとに値を入力する処理*/
/* 20240617_機関コードへの変換処理が不要となったためコメントアウト（また条件が変更されるかもしれないため、物理削除はしない）
/*function ChangeRowsFromInstitutionCode() {
    const fileIds = ['file11', 'file12'];
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 処理開始log
    logger.info('STEP 5 処理を開始しました');

    // map処理でファイル分のFileReaderオブジェクトを生成し、ファイルの読み込みを行う
    const readers = files.map(file => new FileReader());
    const results = [];

    // 各ファイルを順に読み込み、読み込みが完了したタイミングでonload処理が走る（onloadイベント）
    readers.forEach((reader, index) => {
        reader.onload = function (e) {
            results[index] = e.target.result;

            // results配列内のデータがすべてそろったかを確認し、後続処理を行う
            if (results.filter(result => result).length === file_num) {
                try {
                    const mergedCSV = updateAddressCode(results[0], results[1]);
                    downloadCSV(mergedCSV, MIDDLE_FILE_5);
                } catch (error) {
                    // catchしたエラーを表示
                    logger.error(error);
                } finally {
                    logger.info('STEP 5 処理を終了しました');
                }
            }
        };
        reader.readAsText(files[index]);
    });

    function updateAddressCode(csvText1, csvText2) {
        // CSVテキストを行ごとに分割して配列に変換
        const arrayFromMidFile = parseCSV(csvText1);
        const arrayFromInstitutionCode = parseCSV(csvText2);

        // ヘッダー行を取得
        const midFileHeader = arrayFromMidFile.header;
        const InstitutionCodeheader = arrayFromInstitutionCode.header;

        // 必要な列のインデックスを取得
        const addressCodeIndex = midFileHeader.indexOf('転入元都道府県市区町村コード');
        const idCodeIndex = InstitutionCodeheader.indexOf('既存の識別コード');
        const agencyCodeIndex = InstitutionCodeheader.indexOf('機関コード');

        // エラーハンドリング（必要なカラムが存在しない場合、ファイル名とカラムを表示する）
        const missingColumns = [];
        if (addressCodeIndex === -1) {
            missingColumns.push('■ファイル名：' + files[0].name + ' >> 不足カラム名：転入元都道府県市区町村コード');
        }
        if (idCodeIndex === -1) {
            missingColumns.push('■ファイル名：' + files[1].name + ' >> 不足カラム名：既存の識別コード');
        }
        if (agencyCodeIndex === -1) {
            missingColumns.push('■ファイル名：' + files[1].name + ' >> 不足カラム名：機関コード');
        }

        if (missingColumns.length > 0) {
            throw new Error('以下のカラムが見つかりません。ファイルの確認をお願いします。\n' + missingColumns.join('\n'));
        }

        // 中間ファイルのヘッダーに「情報提供者機関コード」カラムを新規作成する
        midFileHeader.push('情報提供者機関コード');

        // 既存の識別コードと機関コードのマッピングを作成
        const idCodeMap = new Map();
        arrayFromInstitutionCode.rows.forEach(line => {
            const idCode = line[idCodeIndex];
            const agencyCode = line[agencyCodeIndex];
            idCodeMap.set(idCode, agencyCode);
        });

        // 中間ファイルの各行を更新
        const updatedRows = arrayFromMidFile.rows.map((line, index) => {
            const addressCode = line[addressCodeIndex];
            const agencyCode = idCodeMap.get(addressCode) || '';
            line.push(agencyCode);
            return line;
        });

        // 更新された行をCSV形式で結合して返す
        return [midFileHeader, ...updatedRows].map(line => line.join(',')).join('\n');
    }
}*/

/* 5.①課税区分に値がある行除外 ②前住所コードの値による行除外 ③異動事由コードの値による行除外 ④税情報照会用ファイル（固定長形式）を出力する処理 */
function deleteRowAndGenerateInquiryFile() {
    // 各ファイルのIDを配列に格納する
    const fileIds = ['file9'];
    const { check, file_num, files } = fileCheck(fileIds);
    if (!check) {
        return; // ファイル数が足りない場合は処理を終了
    }

    // 各ファイルのファイル形式をチェック
    const extensionCheck = fileExtensionCheck(files);
    if (!extensionCheck) {
        return; // ファイル名が「.csv」で終わらない場合はエラーを出して処理終了
    }

    // 「中間ファイル④」がインプットされたことを確認する（前方一致で確認）
    if (!files[0].name.startsWith('中間ファイル④')) {
        alert('アップロードするファイル名を「中間ファイル④」から始まるものにして下さい。');
        return; // ファイル名が「中間ファイル④」で始まらない場合はエラーを出して処理終了
    }

    // 処理開始log
    logger.info('STEP 5 処理を開始しました');
    //showLoading();

    // 読み込んだデータをresults配列の対応する位置に保存する
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            // e.target.result:FileReaderが読み込んだファイルの内容（文字列）
            let text = e.target.result;

            // 必要なヘッダーがあるかチェック
            const { header, rows } = parseCSV(text);
            var requiredColumns = [
                '宛名番号',
                '世帯番号',
                '課税区分',
                '転入元都道府県市区町村コード',
                '異動事由コード',
                // '情報提供者機関コード' // 20240617_機関コードへの変換処理が不要となったためコメントアウト
            ];
            var columnIndices = requiredColumns.map(col => header.indexOf(col));
            // 足りないカラムをチェック
            var missingColumns = requiredColumns.filter((col, index) => columnIndices[index] === -1);

            if (missingColumns.length > 0) {
                throw new Error(`次の列が見つかりませんでした： ${missingColumns.join(', ')}\nファイルを確認してください。`);
            }

            // ①課税区分に値がある行除外 ②前住所コードの値による行除外 ③異動事由コードの値による行除外（一つのfunctionにまとめています）
            const filteredText = FilterTaxAndAddressAndMovementReason(columnIndices, header, rows);
            if (!filteredText) {
                logger.warn('■ファイル名：' + NO_TAXINFO_FILE + ' >> 出力対象レコードが存在しませんでした。');
            } else {
                downloadCSV(filteredText, NO_TAXINFO_FILE);
            }

            // 元STEP6 //
            requiredColumns = [
                '宛名番号',
                '住民票コード',
                '異動事由コード',
                '転入元都道府県市区町村コード' // 20240617_機関コードへの変換処理が不要となったため追加
                // '転入元都道府県市区町村コード' // 20240617_機関コードへの変換処理が不要となったためコメントアウト
            ];
            // カラムのインデックスを取得
            columnIndices = requiredColumns.map(col => header.indexOf(col));
            // 足りないカラムをチェック
            missingColumns = requiredColumns.filter((col, index) => columnIndices[index] === -1);

            if (missingColumns.length > 0) {
                throw new Error(`次の列が見つかりませんでした： ${missingColumns.join(', ')}\nファイルを確認してください。`);
            }

            const filterPreviousPrefectCodeText = filterPreviousPrefectCode(columnIndices, rows);
            if (!filterPreviousPrefectCodeText) {
                logger.warn('■ファイル名：' + RESIDENTINFO_INQUIRY_FILE_1 + ' >> 出力対象レコードが存在しませんでした。');
            } else {
                downloadCSV(filterPreviousPrefectCodeText, RESIDENTINFO_INQUIRY_FILE_1);
            }

            // 元STEP7 //
            requiredColumns = [
                // 以下、ファイル作成用に必要なカラム
                '宛名番号',
                '世帯番号',
                'カナ氏名',
                '漢字氏名',
                '生年月日',
                '性別',
                '届出日',
                '異動日',
                '異動事由コード', //このカラムは、抽出判定時にもファイル作成時にも使用する
                '住民日',
                '住民届出日',
                '住民事由コード',
                '現住所住定日',
                '現住所届出日',
                '消除日',
                '消除届出日',
                '消除事由コード',
                // 以下、除外の判定のために必要なカラム（99999であれば除外する用）
                '転入元都道府県市区町村コード'
            ];
            // カラムのインデックスを取得
            columnIndices = requiredColumns.map(col => header.indexOf(col));
            // 足りないカラムをチェック
            missingColumns = requiredColumns.filter((col, index) => columnIndices[index] === -1);

            if (missingColumns.length > 0) {
                throw new Error(`次の列が見つかりませんでした： ${missingColumns.join(', ')}\nファイルを確認してください。`);
            }

            const filterNaturalizedCitizenText = filterChangeReasonCode(columnIndices, rows);
            if (!filterNaturalizedCitizenText) {
                logger.warn('■ファイル名：' + NATURALIZED_CITIZEN_FILE + ' >> 出力対象レコードが存在しませんでした。');
            } else {
                downloadCSV(filterNaturalizedCitizenText, NATURALIZED_CITIZEN_FILE);
            }

        } catch (error) {
            // catchしたエラーを表示
            logger.error(error);
        } finally {
            logger.info('STEP 5 処理を終了しました');
            hideLoading();
        }
    };
    // onloadイベントを発火
    reader.readAsText(files[0]);

    /**
     * ①課税区分に値がある行除外 ②前住所コードの値による行除外 ③異動事由コードの値による行除外処理
     */
    function FilterTaxAndAddressAndMovementReason(columnIndices, header, rows) {
        const validCodes = ['A51', 'A52', 'A61', 'A62', 'BE1', 'BE2', 'BF1', 'BF2'];

        // 条件に合致するレコードのみをフィルタ
        const filteredLines = rows.filter(line => {
            const [taxClassification, previousAddressCode, changeReasonCode] = [
                line[columnIndices[2]],
                line[columnIndices[3]],
                line[columnIndices[4]]
            ];
            return (taxClassification == '' && previousAddressCode !== '99999' && !validCodes.includes(changeReasonCode));
        });
        // generateFixedLengthFileにテキストを渡し、中間サーバに連携する向けにファイル形式を整える
        // 口座照会用ファイルと仕様は同じだが「事務手続きコード」「情報提供者機関コード」「特定個人情報名コード」が異なるため、引数で値を渡す
        return generateFixedLengthFile([header.join(','), ...filteredLines.map(line => line.join(','))].join('\r\n'), 'JT01010000000214', 'TM00000000000002');
    }

    /**
    *  転入元都道府県市区町村コードが「99999」かつ異動事由コードがA51,A52,A61,A62,BE1,BE2,BF1,BF2のいずれでもない住民を抽出し、ファイル形式を整える 
    */
    function filterPreviousPrefectCode(columnIndices, rows) {
        // ヘッダーとレコード行に分割
        const validCodes = ['A51', 'A52', 'A61', 'A62', 'BE1', 'BE2', 'BF1', 'BF2'];

        // 条件に合致するレコードのみをフィルタする
        const filteredLines = rows.filter(line => {
            const [changeReasonCode, previousAddressCode] = [
                line[columnIndices[2]],
                line[columnIndices[3]]
            ];
            return (!validCodes.includes(changeReasonCode) && previousAddressCode == '99999');
        });

        // フィルタリングされた行から、宛名番号列と住民票コード列のみを抽出する
        const selectedLines = filteredLines.map(line => [
            line[columnIndices[0]],  // 宛名番号列
            line[columnIndices[1]]   // 住民票コード列
        ]);

        // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
        return [['宛名番号', '住民票コード'].join(','), ...selectedLines.map(line => line.join(','))].join('\r\n') + '\r\n';
    }

    /**
    * 転入元都道府県市区町村コードが「99999」ではないかつ異動事由コードがA51,A52,A61,A62,BE1,BE2,BF1,BF2のいずれかの住民を抽出し、ファイル形式を整える
    */
    function filterChangeReasonCode(columnIndices, rows) {
        const validCodes = ['A51', 'A52', 'A61', 'A62', 'BE1', 'BE2', 'BF1', 'BF2'];
        // 出力用のヘッダーを定義する
        const outputHeader = [
            '宛名番号',
            '世帯番号',
            'カナ氏名',
            '漢字氏名',
            '生年月日',
            '性別',
            '届出日',
            '異動日',
            '異動事由コード',
            '住民日',
            '住民届出日',
            '住民事由コード',
            '現住所住定日',
            '現住所届出日',
            '消除日',
            '消除届出日',
            '消除事由コード',
        ];

        // 条件に合致する行を抽出する
        const filteredLines = rows.filter(line => {
            const [changeReasonCode, previousAddressCode] = [
                line[columnIndices[8]],
                line[columnIndices[17]]
            ];
            return (validCodes.includes(changeReasonCode) && previousAddressCode !== '99999');
        });

        // フィルタリングされた行から、必要なカラムのデータのみを抽出する
        const selectedLines = filteredLines.map(line => [
            line[columnIndices[0]],
            line[columnIndices[1]],
            line[columnIndices[2]],
            line[columnIndices[3]],
            line[columnIndices[4]],
            line[columnIndices[5]],
            line[columnIndices[6]],
            line[columnIndices[7]],
            line[columnIndices[8]],
            line[columnIndices[9]],
            line[columnIndices[10]],
            line[columnIndices[11]],
            line[columnIndices[12]],
            line[columnIndices[13]],
            line[columnIndices[14]],
            line[columnIndices[15]],
            line[columnIndices[16]]
        ]);
        // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
        return [outputHeader.join(','), ...selectedLines.map(line => line.join(','))].join('\r\n') + '\r\n';
    }
}

// 中間サーバ照会用のファイルを作成する処理（他ステップでも使用する予定のため、Globalのfunctionとして作成した）
function generateFixedLengthFile(text, procedureCode, personalInfoCode) {
    const lines = text.split('\n').map(line => line.split(','));
    const headers = lines[0];
    const toolUseTime = getCurrentTime().replace(/[:.\-\s]/g, '').trim();

    // アウトプット用のカラムを個別に定義する。プロパティでカラム長、該当する項目、埋め値、固定値（あれば）を定義
    const column1 = { length: 2, name: '番号体系', padding: '0', value: '01' };
    const column2 = { length: 15, name: '宛名番号', padding: '0' };
    const column3 = { length: 15, name: '統合宛名番号', padding: '' };
    const column4 = { length: 17, name: '照会依頼日時', value: toolUseTime };
    const column5 = { length: 20, name: '情報照会者部署コード', padding: ' ', padDirection: 'right', value: '3595115400' };
    const column6 = { length: 20, name: '情報照会者ユーザーID', padding: '' };
    const column7 = { length: 16, name: '情報照会者機関コード', padding: '0', value: '0220113112101700' };
    const column8 = { length: 1, name: '照会側不開示コード', padding: '0', value: '1' };
    const column9 = { length: 16, name: '事務コード', padding: '0', value: 'JM01000000121000' };
    const column10 = { length: 16, name: '事務手続きコード', padding: '0', value: procedureCode };
    const column11 = { length: 16, name: '情報照会者機関コード（委任元）', padding: '' };
    const column12 = { length: 16, name: '情報提供者機関コード（委任元）', padding: '' };
    const column13 = { length: 16, name: '転入元都道府県市区町村コード', padding: ' ', padDirection: 'right' };// 仕様のカラム名は「情報提供者機関コード」だが、インプットになるカラム名を設定
    const column14 = { length: 16, name: '特定個人情報名コード', padding: '0', value: personalInfoCode };
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
    }).join('\r\n') + '\r\n';
}

/* 6. 住基照会用ファイル①を出力する処理 */
/* 前住所地の住所コードが「99999」である住民を抽出し、「宛名番号,住民票コード」の構成に整形する */
// function generatePreviousAddressForeignFile() {
//     const fileIds = ['file13'];
//     const { check, file_num, files } = fileCheck(fileIds);
//     if (!check) {
//         return; // ファイル数が足りない場合は処理を終了
//     }

//     // 処理開始log
//     logger.info('STEP 6 処理を開始しました');

//     // 読み込んだデータをresults配列の対応する位置に保存する
//     const reader = new FileReader();
//     reader.onload = function (e) {
//         try {
//             // e.target.result:FileReaderが読み込んだファイルの内容（文字列）
//             let text = e.target.result;

//             // 必要なヘッダーがあるかチェック
//             const { header, rows } = parseCSV(text);
//             const requiredColumns = [
//                 '宛名番号',
//                 '住民票コード',
//                 '異動事由コード',
//                 '転入元都道府県市区町村コード' // 20240617_機関コードへの変換処理が不要となったため追加
//                 // '転入元都道府県市区町村コード' // 20240617_機関コードへの変換処理が不要となったためコメントアウト
//             ];
//             // カラムのインデックスを取得
//             const columnIndices = requiredColumns.map(col => header.indexOf(col));
//             // 足りないカラムをチェック
//             const missingColumns = requiredColumns.filter((col, index) => columnIndices[index] === -1);

//             if (missingColumns.length > 0) {
//                 throw new Error(`次の列が見つかりませんでした： ${missingColumns.join(', ')}\nファイルを確認してください。`);
//             }

//             const filterPreviousPrefectCodeText = filterPreviousPrefectCode(columnIndices, rows);
//             if (!filterPreviousPrefectCodeText) {
//                 logger.warn("出力対象レコードが存在しませんでした。");
//             } else {
//                 downloadCSV(filterPreviousPrefectCodeText, RESIDENTINFO_INQUIRY_FILE_1);
//             }
//         } catch (error) {
//             // catchしたエラーを表示
//             logger.error(error);
//         } finally {
//             logger.info('STEP 6 処理を終了しました');
//         }
//     };
//     // onloadイベントを発火
//     reader.readAsText(files[0]);

//     /* 転入元都道府県市区町村コードが「99999」かつ異動事由コードがA51,A52,A61,A62,BE1,BE2,BF1,BF2のいずれでもない住民を抽出し、ファイル形式を整える */
//     function filterPreviousPrefectCode(columnIndices, rows) {
//         // ヘッダーとレコード行に分割
//         const validCodes = ['A51', 'A52', 'A61', 'A62', 'BE1', 'BE2', 'BF1', 'BF2'];

//         // 条件に合致するレコードのみをフィルタする
//         const filteredLines = rows.filter(line => {
//             const [changeReasonCode, previousAddressCode] = [
//                 line[columnIndices[2]],
//                 line[columnIndices[3]]
//             ];
//             return (!validCodes.includes(changeReasonCode) && previousAddressCode == '99999');
//         });

//         // フィルタリングされた行から、宛名番号列と住民票コード列のみを抽出する
//         const selectedLines = filteredLines.map(line => [
//             line[columnIndices[0]],  // 宛名番号列
//             line[columnIndices[1]]   // 住民票コード列
//         ]);

//         // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
//         return [['宛名番号', '住民票コード'].join(','), ...selectedLines.map(line => line.join(','))].join('\r\n') + '\r\n';
//     }
// }

/* 7. 帰化対象者をファイルを出力する処理 */
// function generateNaturalizedCitizenFile() {
//     // 各ファイルのIDを配列に格納する
//     const fileIds = ['file14'];
//     // 各ファイルのIDを配列に格納する
//     const { check, file_num, files } = fileCheck(fileIds);
//     if (!check) {
//         return; // ファイル数が足りない場合は処理を終了
//     }

//     // 処理開始log
//     logger.info('STEP 7 処理を開始しました');

//     // 読み込んだデータをresults配列の対応する位置に保存する
//     const reader = new FileReader();
//     reader.onload = function (e) {
//         try {
//             // e.target.result:FileReaderが読み込んだファイルの内容（文字列）
//             let text = e.target.result;

//             // 必要なヘッダーがあるかチェック
//             const { header, rows } = parseCSV(text);
//             const requiredColumns = [
//                 // 以下、ファイル作成用に必要なカラム
//                 '宛名番号',
//                 '世帯番号',
//                 'カナ氏名',
//                 '漢字氏名',
//                 '生年月日',
//                 '性別',
//                 '届出日',
//                 '異動日',
//                 '異動事由コード', //このカラムは、抽出判定時にもファイル作成時にも使用する
//                 '住民日',
//                 '住民届出日',
//                 '住民事由コード',
//                 '現住所住定日',
//                 '現住所届出日',
//                 '消除日',
//                 '消除届出日',
//                 '消除事由コード',
//                 // 以下、除外の判定のために必要なカラム（99999であれば除外する用）
//                 '転入元都道府県市区町村コード'
//             ];
//             // カラムのインデックスを取得
//             const columnIndices = requiredColumns.map(col => header.indexOf(col));
//             // 足りないカラムをチェック
//             const missingColumns = requiredColumns.filter((col, index) => columnIndices[index] === -1);

//             if (missingColumns.length > 0) {
//                 throw new Error(`次の列が見つかりませんでした： ${missingColumns.join(', ')}\nファイルを確認してください。`);
//             }

//             const filterNaturalizedCitizenText = filterChangeReasonCode(columnIndices, rows);
//             if (!filterNaturalizedCitizenText) {
//                 logger.warn("出力対象レコードが存在しませんでした。");
//             } else {
//                 downloadCSV(filterNaturalizedCitizenText, NATURALIZED_CITIZEN_FILE);
//             }
//         } catch (error) {
//             // catchしたエラーを表示
//             logger.error(error);
//         } finally {
//             logger.info('STEP 7 処理を終了しました');
//         }
//     };
//     // onloadイベントを発火
//     reader.readAsText(files[0]);

//     /* 転入元都道府県市区町村コードが「99999」ではないかつ異動事由コードがA51,A52,A61,A62,BE1,BE2,BF1,BF2のいずれかの住民を抽出し、ファイル形式を整える */
//     function filterChangeReasonCode(columnIndices, rows) {
//         const validCodes = ['A51', 'A52', 'A61', 'A62', 'BE1', 'BE2', 'BF1', 'BF2'];
//         // 出力用のヘッダーを定義する
//         const outputHeader = [
//             '宛名番号',
//             '世帯番号',
//             'カナ氏名',
//             '漢字氏名',
//             '生年月日',
//             '性別',
//             '届出日',
//             '異動日',
//             '異動事由コード',
//             '住民日',
//             '住民届出日',
//             '住民事由コード',
//             '現住所住定日',
//             '現住所届出日',
//             '消除日',
//             '消除届出日',
//             '消除事由コード',
//         ];

//         // 条件に合致する行を抽出する
//         const filteredLines = rows.filter(line => {
//             const [changeReasonCode, previousAddressCode] = [
//                 line[columnIndices[8]],
//                 line[columnIndices[17]]
//             ];
//             return (validCodes.includes(changeReasonCode) && previousAddressCode !== '99999');
//         });

//         // フィルタリングされた行から、必要なカラムのデータのみを抽出する
//         const selectedLines = filteredLines.map(line => [
//             line[columnIndices[0]],
//             line[columnIndices[1]],
//             line[columnIndices[2]],
//             line[columnIndices[3]],
//             line[columnIndices[4]],
//             line[columnIndices[5]],
//             line[columnIndices[6]],
//             line[columnIndices[7]],
//             line[columnIndices[8]],
//             line[columnIndices[9]],
//             line[columnIndices[10]],
//             line[columnIndices[11]],
//             line[columnIndices[12]],
//             line[columnIndices[13]],
//             line[columnIndices[14]],
//             line[columnIndices[15]],
//             line[columnIndices[16]]
//         ]);
//         // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
//         return [outputHeader.join(','), ...selectedLines.map(line => line.join(','))].join('\r\n') + '\r\n';
//     }
// }



/* 11. 税情報無しの住民を含んだファイルに対し、番号連携照会結果（税情報）ファイルの値によって課税/非課税か更新をかける処理 */
function updateFukaByAtenaNumber() {
    processTwoFiles('file15', 'file16', updateheaderless, '中間ファイル⑧.csv');
}

function updateheaderless(csvText1, csvText2) {

    const fileInput1 = document.getElementById('file15');
    const fileInput2 = document.getElementById('file16');

    fileInput1.addEventListener('change', handleFileSelect);
    fileInput2.addEventListener('change', handleFileSelect);

    function handleFileSelect(event) {
        const selectedFile = event.target.files[0];
        if (!selectedFile) return; // ファイルが選択されていない場合は処理を中断

        const allowedFileName = event.target.id === 'file15' ? '中間ファイル⑤.csv' : '番号連携照会結果.csv';

        if (selectedFile.name !== allowedFileName) {
            alert(`正しいファイルをアップロードしてください。(${allowedFileName} をアップロードしてください)`);
            event.target.value = ''; // ファイル選択ボックスをクリア
        }
    }

    //ここから既存処理
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
    const fileName2 = files[1].name;
    //const fileExtension = fileName.split('.').pop().toLowerCase();


    if (fileName != '中間ファイル⑧.csv') {
        alert("「中間ファイル⑧.csv」をアップロードしてください。");
        return;
    }

    if (fileName2 != '帰化対象者.csv') {
        alert("「帰化対象者.csv」をアップロードしてください。");
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

        // 中間ファイルの宛名番号を配列に取得
        let middle_file_nums = parsedCSVs[0].rows.map(m_row => m_row[addressIndex[1]]);

        // 帰化対象者の宛名番号を取得し、比較する
        let extraction = parsedCSVs[1].rows.filter(nt_row => {
            let NFnaturalization_target_num = nt_row[addressIndex[1]];

            // 中間ファイルに存在しないか確認
            return !middle_file_nums.includes(NFnaturalization_target_num);
        }).map(nt_row => nt_row[addressIndex[1]]);

        // エラーメッセージの出力
        if (extraction.length > 0) {
            logger.error('中間ファイルに存在しない宛名番号があります。宛名番号：' + extraction.join(','));
        }

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

/**
 * アップロードされたファイルがCSV形式かを確認する処理
 * @param {string[]} files ファイル名チェックを受けるファイルの配列
 * @returns {boolean} チェック結果
 */
function fileExtensionCheck(files) {
    // 拡張子が.csvでないファイルを格納する配列
    const errorFileNames = [];

    // 各ファイルの拡張子をチェック
    files.forEach(file => {
        if (!file.name.endsWith('.csv')) {
            errorFileNames.push(file.name);
        }
    });

    // エラーとして拡張子が「.csv」でないファイル名を表示する
    if (errorFileNames.length > 0) {
        alert('以下のファイルの拡張子が「.csv」ではありません。\nアップロードするファイルはCSVファイルを使用して下さい。\n' + errorFileNames.join('\n'));
        return false;
    }

    return true;
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
 * @return {string} 課税対象の住民を含む世帯の行を除外したデータを文字列化して出力
 */
function filterTaxExcluded(text) {
    const lines = parseCSV(text)
    const taxClassification = lines.header.indexOf('課税区分');
    const householdNumIndex = lines.header.indexOf('世帯番号');

    if (taxClassification === -1) {
        throw ('課税区分列が見つかりません。');
    }

    if (householdNumIndex === -1) {
        throw ('世帯番号列が見つかりません。');
    }

    // 除外対象の世帯番号の値を収集するためのセットを作成する
    const excludedHouseholdNumSet = new Set();

    // 課税区分が「3」の行の「世帯番号」カラムの値を取得する
    lines.rows.forEach((line) => {
        if (line[taxClassification] === '3') {
            // 「世帯番号」の値をセットに追加する
            excludedHouseholdNumSet.add(line[householdNumIndex]);
        }
    });

    // 収集した世帯番号に属する行を除外する
    const filteredLines = lines.rows.filter((line) => {
        return !excludedHouseholdNumSet.has(line[householdNumIndex]);
    });

    // フィルタリングされた行を再度カンマで結合し、改行で区切られた文字列に変換
    return [lines.header.join(','), ...filteredLines.map(line => line.join(','))].join('\n');
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
    document.getElementById('btn_audio').play();
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

/**
 * 現在時刻を取得する
 * @return {String} YYYY-MM-dd HH:mm:ss.sss
 */
function getCurrentTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

/* 使いまわすメソッド（汎用処理）ここまで */

// ログ出力クラス
class Logger {
    constructor(level = 'info', logContainerId = 'log-box') {
        this.levels = ['debug', 'info', 'warn', 'error'];
        this.level = level;
        this.logContainer = document.getElementById(logContainerId);
    }

    // ログレベル・時刻・メッセージを結合
    log(level, message) {
        if (this.levels.indexOf(level) >= this.levels.indexOf(this.level)) {
            const timestamp = getCurrentTime();
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

/**
 * ロード中のグルグルを表示
 */
function showLoading() {
    //document.getElementById('load_circle').style.display = "block";
}
/**
 * ロード中のグルグルを非表示
 */
function hideLoading() {
    //document.getElementById('load_circle').style.display = "none";
}