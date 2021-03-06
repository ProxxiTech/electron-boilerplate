import { Grid } from "ag-grid";

import barcodeScanner from "../helpers/barcodeScanner";

import * as spreadsheet from "../spreadsheet/spreadsheet";

import AppPage from "./AppPage";

class InventoryPage extends AppPage {
  constructor(data) {
    super(data);
  }

  onInitialize(appState) {
    super.onInitialize(appState);

    this.nextRowID = 1001;
    this.changedRow = {};

    this.Elements = {};
    let elementNames = [
      "grid",
    ];
    for (let name of elementNames) {
      this.Elements[name] = document.querySelector(`#${this.pageName}-${name}`);
    }
  }

  allocateRowID() {
    return this.nextRowID++;
  }

  onDataReady() {
    super.onDataReady();
  }

  updateSpreadsheetGrid() {
    let columnDefs = [];
    for (let i=0; i<spreadsheet.invNumCols; i++) {
      let invName = spreadsheet.invHeaderIndexToName[i];

      let colDef = {
        field: invName,
        headerName: invName
      };
      columnDefs.push(colDef);
    }

    // columnDefs[0].width = 150;
    // columnDefs[0].maxWidth = 150;
    // columnDefs[0].suppressSizeToFit = true;
    // columnDefs[0].suppressSorting = false;
    columnDefs[spreadsheet.invHeaderNameToIndex["pn"]].sort = "asc";

    let numericColumnNames = ["Quantity"];
    for (let numericColumnName of numericColumnNames) {
      let numericColumnIndex = spreadsheet.invHeaderNameToIndex[numericColumnName];

      columnDefs[numericColumnIndex].valueGetter = (params) => {
        let val = params.data[params.colDef.field];
        if (val === null) {
          return null;
        }
        return parseInt(val, 10);
      };
      // columnDefs[numericColumnIndex].valueFormatter = (params) => {
      //   return params.value.toString();
      // };
      columnDefs[numericColumnIndex].filter = "agNumberColumnFilter";
      columnDefs[numericColumnIndex].filterParams = { inRangeInclusive: true };
    }

    let rowData = [];
    for (let i=0; i<spreadsheet.getInventoryItemCount(); i++) {
      let item = spreadsheet.getInventoryItem(i);

      rowData.push({
        ...item,
        itemIndex: i,
        rowID: this.allocateRowID()
      });
    }

    this.gridOptions = {
      columnDefs: columnDefs,
      rowData: rowData,

      getRowNodeId: (data) => {
        return data.rowID;
      },

      defaultColDef: {
        // Auto-sized when in onEnter(), but until then we want everything to be "on screen"
        width: 50,

        editable: true,
        filter: "agTextColumnFilter",
      },

      suppressMovableColumns: true,
      enableSorting: true,
      enableColResize: true,
      enableFilter: true,
      suppressRowDrag: true,

      editType: "fullRow",
      stopEditingWhenGridLosesFocus: true,
      rowSelection: "single",
      rowDeselection: true,
      suppressScrollOnNewData: true,
      // pagination: true,
      // paginationAutoPageSize: true,

      // onGridReady: (params) => {
      // },

      onCellValueChanged: (params) => {
        // console.log(`Column ${params.colDef.field} changed of row ${params.data.itemIndex} from ${params.oldValue} to ${params.newValue} (${params.value})`);

        this.changedRow[params.colDef.field] = (typeof params.newValue === "string") ? params.newValue.trim() : params.newValue;
      },
      onRowValueChanged: (params) => {
        // console.log(`Row ${params.data.itemIndex} changed`);

        let item = spreadsheet.getInventoryItem(params.data.itemIndex);
        let updatedRow = {
          ...item,
          ...this.changedRow
        };

        this.changedRow = {};

        let isCleared = true;
        for (let [, value] of Object.entries(updatedRow)) {
          isCleared = isCleared && !value;
        }
        if (isCleared) {
          // Remove item
          spreadsheet.removeInventoryItem(params.data.itemIndex, (err) => {
            if (err != null) {
              return console.error(err);
            }

            let updateList = [];
            for (let row of rowData) {
              if (row.itemIndex > params.data.itemIndex) {
                row.itemIndex--;
                updateList.push(row);
              }
            }

            rowData.splice(params.data.itemIndex, 1);

            let transaction = {
              remove: [params.data],
              update: updateList
            };
            params.api.updateRowData(transaction);
          });
        } else {
          // Update item
          spreadsheet.setInventoryItem(params.data.itemIndex, updatedRow, (err) => {
            if (err != null) {
              return console.error(err);
            }
          });
        }
      },
    };

    new Grid(this.Elements.grid, this.gridOptions);
  }

  onScanBarcodeCompleted({ internalPN, locationID, manufacturerPN }) {
    let mpnFilterComponent = this.gridOptions.api.getFilterInstance("Manufacturer Part Number");
    let ipnFilterComponent = this.gridOptions.api.getFilterInstance("Part Number");
    let locFilterComponent = this.gridOptions.api.getFilterInstance("Location");

    mpnFilterComponent.setModel(null);
    ipnFilterComponent.setModel(null);
    locFilterComponent.setModel(null);

    if (manufacturerPN) {
      mpnFilterComponent.setModel({
        type: "equals",  // One of: {equals, notEqual, contains, notContains, startsWith, endsWith}
        filter: manufacturerPN
      });
    } else if (internalPN) {
      ipnFilterComponent.setModel({
        type: "equals",  // One of: {equals, notEqual, contains, notContains, startsWith, endsWith}
        filter: internalPN
      });
    } else if (locationID) {
      locFilterComponent.setModel({
        type: "equals",  // One of: {equals, notEqual, contains, notContains, startsWith, endsWith}
        filter: locationID
      });
    }

    mpnFilterComponent.onFilterChanged();
    ipnFilterComponent.onFilterChanged();
    locFilterComponent.onFilterChanged();
  }

  onEnter() {
    super.onEnter();

    if (this.gridOptions) {
      this.gridOptions.api.destroy();
    }
    this.updateSpreadsheetGrid();

    this.onCaptureEndHandle = barcodeScanner.addListener("onCaptureEnd", (barcodeData) => {
      this.onScanBarcodeCompleted(barcodeData);
    });
  }

  showPage() {
    super.showPage();

    // this.gridOptions.api.sizeColumnsToFit();

    let allColumnIds = [];
    this.gridOptions.columnApi.getAllColumns().forEach((column) => {
      allColumnIds.push(column.colId);
    });
    // Start with the last column, as if it's off-screen it won't be resized
    allColumnIds.reverse();
    this.gridOptions.columnApi.autoSizeColumns(allColumnIds);

    let overrideWidths = {
      // "Quantity": 125,
      "Description": 500,
    };
    for (let [columnName, width] of Object.entries(overrideWidths)) {
      this.gridOptions.columnApi.setColumnWidth(columnName, width);
    }
  }

  onExit() {
    super.onExit();

    barcodeScanner.removeListener("onCaptureEnd", this.onCaptureEndHandle);
  }
}

export default InventoryPage;
