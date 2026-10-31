# Google Sheets: manual check

Google Sheets cannot be tested headlessly. These steps are for the owner.

1. Download the workbook from the app: Exports, then Download Excel. It ships with the circularity switch at 0.
2. In Google Drive choose New, File upload, select the file, then open it with Google Sheets.
3. On Cover, confirm "Master check" reads TRUE.
4. Confirm no cell shows an error: on each sheet use Edit, Find and replace, and search for `#`.
5. On Inputs, set "Scenario selector" to 1, then 3, then back to 2. On Checks, every line except the sensitivity line should stay TRUE. The sensitivity line is valid only for the exported scenario.
6. Iterative calculation: open File, Settings, Calculation. Note whether "Iterative calculation" is on after the import. Record the answer here: ______
7. If it is off, turn it on (100 iterations, threshold 0.001). Set "Circularity" on Inputs to 1. Confirm the master check is TRUE. Record the result here: ______
8. Set the switch back to 0.
9. Confirm negatives show parentheses in full on Model, and zero shows as a dash.
