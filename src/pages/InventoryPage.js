import { Grid } from "ag-grid";

import * as spreadsheet from "../spreadsheet/spreadsheet";

import AppPage from "./AppPage";

class InventoryPage extends AppPage {
  constructor(data) {
    super(data);
  }

  onInitialize() {
    super.onInitialize();

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
        editable: true,
      },

      suppressMovableColumns: true,
      suppressRowDrag: true,

      editType: "fullRow",
      stopEditingWhenGridLosesFocus: true,
      enableSorting: true,
      rowSelection: "single",
      rowDeselection: true,
      suppressScrollOnNewData: true,
      // pagination: true,
      // paginationAutoPageSize: true,

      // onGridReady: (params) => {
      // },

      onCellValueChanged: (params) => {
        // console.log(`Column ${params.colDef.field} changed of row ${params.data.itemIndex} from ${params.oldValue} to ${params.newValue} (${params.value})`);

        this.changedRow[params.colDef.field] = params.newValue.trim();
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

  onEnter() {
    super.onEnter();

    this.gridOptions.api.sizeColumnsToFit();
  }

  onExit() { super.onExit(); }
}

export default InventoryPage;