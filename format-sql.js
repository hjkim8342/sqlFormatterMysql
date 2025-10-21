#!/usr/bin/env node
// /Users/{사용자}/.nvm/versions/node/v22.13.0/bin/node /Users/{사용자}/dev/sql-formatter-cli/format-sql.js
let sql = "";

process.stdin.setEncoding("utf-8");

process.stdin.on("data", chunk => {
    sql += chunk;
});

process.stdin.on("end", () => {
    // 1. 연속 공백 제거
    let formatted = sql.replace(/\s+/g, " ");

    // 2. 주요 키워드 줄바꿈 + 뒤 공백 1칸
    const keywords = [
        "SELECT", "DELETE", "UPDATE", "INSERT", "FROM", "WHERE",
        "JOIN", "INNER JOIN", "LEFT JOIN", "LEFT OUTER JOIN",
        "GROUP BY", "ORDER BY", "LIMIT", "SET", "HAVING"
    ];
    const regex = new RegExp(`\\b(${keywords.join("|")})\\b`, "gi");
    let firstKeyword = true; // 첫 번째 키워드 체크
    formatted = formatted.replace(regex, (m) => {
        if (firstKeyword) {
            firstKeyword = false;
            return m.toUpperCase(); // 첫 번째 키워드 앞에는 줄바꿈 안 넣음
        } else {
            return "\n" + m.toUpperCase(); // 나머지는 기존대로
        }
    });

    // 키워드 뒤 공백 2개 이상 → 1개로
    formatted = formatted.replace(/([A-Z]+\b) {2,}/g, "$1 ");
    // 연속 줄바꿈 2개 이상 → 1개로
    formatted = formatted.replace(/\n{2,}/g, "\n");
    // 공백+줄바꿈 섞인 것도 줄바꿈 1개로
    formatted = formatted.replace(/ *\n+ */g, "\n");
    // 닫힘 괄호 뒤 공백만 제거 (줄바꿈은 유지)
    formatted = formatted.replace(/\)( +)/g, ")");

    // 4. 콤마 앞 줄바꿈 + 4칸 들여쓰기 (LIMIT 뒤는 무시)
    formatted = formatted.replace(/,\s*/g, (match, offset) => {
        const before = formatted.slice(0, offset).toUpperCase();
        if (/LIMIT\s+\d*$/i.test(before)) {
            return ", "; // LIMIT 뒤면 줄바꿈/들여쓰기 안함
        } else {
            return "\n    , "; // 나머지 콤마는 줄바꿈 + 4칸 들여쓰기
        }
    });

    // 3. 괄호 들여쓰기 처리
    let result = "";
    let indentLevel = 0;
    let inLineStart = true;
    for (let i = 0; i < formatted.length; i++) {
        const char = formatted[i];
        if (char === "(") {
            indentLevel++;
            result += "("; // 줄바꿈 없이 그대로
            inLineStart = false;
        } else if (char === ")") {
            indentLevel--;
            if (inLineStart) result += "    ".repeat(indentLevel);
            result += ")";
            inLineStart = false;
        } else if (char === "\n") {
            result += char;
            inLineStart = true;
        } else {
            if (inLineStart) {
                result += "    ".repeat(indentLevel);
                inLineStart = false;
            }
            result += char;
        }
    }
    formatted = result;

    // 5. AND/OR/ON 줄바꿈 + 4칸 들여쓰기
    formatted = formatted.replace(/\s+(AND|OR|ON)\s+/gi, "\n    $1 ");

    // 6. 세미콜론 뒤 1줄 공백
    formatted = formatted.replace(/;/g, ";\n");

    // 7. 여러 줄 공백 제거
    formatted = formatted.replace(/\n\s*\n+/g, "\n");

    // 8. 첫 줄 들여쓰기 제거
    formatted = formatted.replace(/^\s+/, "");

    // 9. 비교 연산자 + AS 앞뒤 공백 처리
    formatted = formatted.replace(/\s*(!=|<>|>=|<=|!<|!>|=|>|<)\s*/gi, ' $1 ');
    // 앞이 특수문자 )`' 붙은 경우 무조건 공백 넣기
    formatted = formatted.replace(/([\)\`\'])(AS)/gi, '$1 $2');
    // AS 뒤에 특수문자 )`' 붙은 경우 무조건 공백 넣기
    formatted = formatted.replace(/(AS)([\(\`\'])/gi, '$1 $2');

    process.stdout.write(formatted);
});
