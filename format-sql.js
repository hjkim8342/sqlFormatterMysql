#!/usr/bin/env node
let sql = "";

process.stdin.setEncoding("utf-8");

process.stdin.on("data", (chunk) => {
  sql += chunk;
});

process.stdin.on("end", () => {
  // 1. 연속 공백 제거
  let formatted = sql.replace(/\s+/g, " ");

  // 2. 주요 키워드 줄바꿈 + 뒤 공백 1칸
  const keywords = [
    "SELECT",
    "DELETE",
    "UPDATE",
    "INSERT",
    "FROM",
    "WHERE",
    "JOIN",
    "INNER JOIN",
    "LEFT JOIN",
    "LEFT OUTER JOIN",
    "GROUP BY",
    "ORDER BY",
    "LIMIT",
    "SET",
    "HAVING",
    "UNION",
    "EXISTS",
  ];
  const regex = new RegExp(`\\b(${keywords.join("|")})\\b`, "gi");
  let firstKeyword = true;
  formatted = formatted.replace(regex, (m) => {
    if (firstKeyword) {
      firstKeyword = false;
      return m.toUpperCase();
    } else {
      return "\n" + m.toUpperCase();
    }
  });

  // 키워드 뒤 공백 2개 이상 → 1개로
  formatted = formatted.replace(/([A-Z]+\b) {2,}/g, "$1 ");
  // 연속 줄바꿈 2개 이상 → 1개로
  formatted = formatted.replace(/\n{2,}/g, "\n");
  // 공백+줄바꿈 섞인 것도 줄바꿈 1개로
  formatted = formatted.replace(/ *\n+ */g, "\n");
  // 닫힘 괄호 뒤 공백만 제거 (원래 의도 유지)
  formatted = formatted.replace(/\)( +)/g, ")");

  // ===== 콤마 처리 개선 (괄호/SELECT 절 조건 포함) =====
  formatted = formatted.replace(/,\s*/g, function (match, offset, str) {
    const before = str.slice(0, offset);
    const upperBefore = before.toUpperCase();

    // LIMIT 뒤는 무시 (예: ORDER BY x LIMIT 10, ...)
    if (/LIMIT\s+\d*$/i.test(upperBefore.trim())) {
      return ", ";
    }

    // 괄호 깊이 판단: 콤마 앞까지 열린 '(' 수와 닫힌 ')' 수 비교
    const openCount = (upperBefore.match(/\(/g) || []).length;
    const closeCount = (upperBefore.match(/\)/g) || []).length;
    const inParen = openCount > closeCount;

    if (inParen) {
      // 가장 가까운 '('의 인덱스 (콤마 기준으로 뒤집어 찾음)
      const lastOpenIndex = before.lastIndexOf("(");
      if (lastOpenIndex !== -1) {
        // 해당 '('의 짝 닫는 ')'을 찾기 위해 앞으로 스캔
        let depth = 0;
        let matchCloseIndex = -1;
        for (let i = lastOpenIndex; i < str.length; i++) {
          const ch = str[i];
          if (ch === "(") depth++;
          else if (ch === ")") {
            depth--;
            if (depth === 0) {
              matchCloseIndex = i;
              break;
            }
          }
        }
        // matchCloseIndex가 -1이면 아직 닫히지 않은 경우(문법상 불완전) —
        // 그때는 괄호 시작부터 콤마 직전까지를 검사
        const inside =
          matchCloseIndex === -1
            ? str.slice(lastOpenIndex + 1, offset)
            : str.slice(lastOpenIndex + 1, matchCloseIndex);

        const hasSelect = /\bSELECT\b/i.test(inside);
        if (!hasSelect) {
          // 괄호 안인데 SELECT가 없으면 줄바꿈/들여쓰기 하지 않음
          return ", ";
        } else {
          // 괄호 안에 SELECT가 있으면 줄바꿈 + 들여쓰기
          return "\n    , ";
        }
      } else {
        // 안전장치: '('를 못 찾으면 기본 처리
        return "\n    , ";
      }
    }

    // 괄호 밖의 기본 동작: 줄바꿈 + 들여쓰기
    return "\n    , ";
  });

  // ===== ')' 바로 뒤에 AND/OR/ON 붙어있는 경우 공백 삽입 (예: ")AND" -> ") AND") =====
  formatted = formatted.replace(/\)(?=(AND|OR|ON|AS)\b)/gi, ") ");

  // ===== AND / OR / ON 처리: WHERE/ON/HAVING 기준 괄호 내부면 줄바꿈 억제, 그 외 줄바꿈 =====
  // WHERE/ON/HAVING 이후 범위에서의 괄호 깊이만 고려하여 서브쿼리 외부 괄호 영향 제거
  formatted = formatted.replace(
    /\s+(AND|OR|ON)\s+/gi,
    function (match, p1, offset, str) {
      const upper = str.toUpperCase();
      // 최근 조건 시작 키워드 위치 탐색 (WHERE, ON, HAVING)
      const lastWhere = upper.lastIndexOf(" WHERE ", offset);
      const lastOn = upper.lastIndexOf(" ON ", offset);
      const lastHaving = upper.lastIndexOf(" HAVING ", offset);
      const clauseStart = Math.max(lastWhere, lastOn, lastHaving);

      if (clauseStart !== -1) {
        const segment = str.slice(clauseStart, offset);
        const opens = (segment.match(/\(/g) || []).length;
        const closes = (segment.match(/\)/g) || []).length;
        const inClauseParen = opens > closes;
        if (inClauseParen) {
          return " " + p1 + " ";
        }
        return "\n    " + p1 + " ";
      }

      // 안전장치: 조건 키워드를 찾지 못하면 기존 전역 괄호 기준으로 판단
      const before = str.slice(0, offset);
      const openCount = (before.match(/\(/g) || []).length;
      const closeCount = (before.match(/\)/g) || []).length;
      const inParen = openCount > closeCount;
      if (inParen) {
        return " " + p1 + " ";
      }
      return "\n    " + p1 + " ";
    }
  );

  // 3. 괄호 들여쓰기 처리
  let result = "";
  let indentLevel = 0;
  let inLineStart = true;
  for (let i = 0; i < formatted.length; i++) {
    const char = formatted[i];
    if (char === "(") {
      indentLevel++;
      result += "(";
      inLineStart = false;
    } else if (char === ")") {
      indentLevel--;
      if (inLineStart) result += "    ".repeat(Math.max(0, indentLevel));
      result += ")";
      inLineStart = false;
    } else if (char === "\n") {
      result += char;
      inLineStart = true;
    } else {
      if (inLineStart) {
        result += "    ".repeat(Math.max(0, indentLevel));
        inLineStart = false;
      }
      result += char;
    }
  }
  formatted = result;

  // 6. 세미콜론 뒤 한 줄 띄우기
  formatted = formatted.replace(/;/g, ";\n");

  // 7. 여러 줄 공백 제거
  formatted = formatted.replace(/\n\s*\n+/g, "\n");

  // 8. 첫 줄 들여쓰기 제거
  formatted = formatted.replace(/^\s+/, "");

  // 9. 비교 연산자 + AS 공백 정리
  formatted = formatted.replace(/\s*(!=|<>|>=|<=|!<|!>|=|>|<)\s*/gi, " $1 ");
  formatted = formatted.replace(/([\)\`\'])(AS)/gi, "$1 $2");
  formatted = formatted.replace(/(AS)([\(\`\'])/gi, "$1 $2");

  process.stdout.write(formatted);
});
