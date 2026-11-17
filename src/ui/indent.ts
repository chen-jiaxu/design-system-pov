/** 按 Tab 键时插入的缩进：文件里用 tab 缩进就插入 tab，否则两个空格 */
export const indentOf = (text: string) => (/^\t/m.test(text) ? "\t" : "  ");
