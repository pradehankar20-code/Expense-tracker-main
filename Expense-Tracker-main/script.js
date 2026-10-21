let head_income = document.getElementById("incValue");
let head_expense = document.getElementById("expValue");
let head_bal = document.getElementById("balValue");

let amount = document.getElementById("amt");
let list = document.getElementById("list");
let description = document.getElementById("detail");
let category = document.getElementById("cat");
let dateString = document.getElementById("DATE");

let total_income = 0;
let total_expense = 0;

let entries = [];

let selected = "";

function result(){
    selected = document.querySelector("input[name='bt1']:checked");

    if(!selected) {
        alert("Select Income or Expense"); 
        return;
    }

    if(description.value === "" || amount.value === ""){
    alert("Fill all Fields");
    return;
    }

    if(category.value === "none" || !category){
        alert("Select category");
        return;
    }

    if(dateString.value === ""){
        alert("Please select the date");
        return;
    }
    
    let type = selected.id === "in1" ? "income" : "expense";

    let entry = {
        text: description.value,
        amount: Number(amount.value),
        CATEGORY: category.value,
        DATE: dateString.value,
        type: type
    }
    
    entries.push(entry);

    if(type === "income"){
        total_income += Number(entry.amount);
        head_income.innerHTML = total_income;
    } else {
        total_expense += Number(entry.amount);
        head_expense.innerHTML = total_expense;
    }

    head_bal.innerHTML = (total_income - total_expense);

    renderList("all");

    description.value = "";
    amount.value = "";
    category.value = "";
    dateString.value = "";

    SAVE();
}

function renderList(filter){
    list.innerHTML = "";

    entries.forEach(item => {
        if(filter === "all" || item.type === filter){
            let li = document.createElement("li");
            li.innerHTML = "<span id='itm_text'>" + item.text+ "</span>"
                         + "<span id='itm_cat'>" + item.CATEGORY + "</span>"
                          + "<span id='itm_amt'>" + item.amount + "</span>"
                          + "<span id='itm_date'>" + item.DATE + "</span>";
            li.className = item.type;
            list.appendChild(li);
        }
    })
}

document.getElementById("all").addEventListener("change", () => {
    renderList("all");
})

document.getElementById("ep2").addEventListener("change", () => {
    renderList("expense");
})

document.getElementById("in2").addEventListener("change", () => {
    renderList("income");
})

function SAVE(){
    const data = {
        income: total_income,
        expense: total_expense,
        balance: total_income - total_expense,
        entries: entries
    };
    localStorage.setItem("data", JSON.stringify(data));
}

function LOAD(){
    const saved = localStorage.getItem("data");

    if(!saved) return;

    const data = JSON.parse(saved);

    total_income = data.income;
    total_expense = data.expense;
    entries = data.entries;

    head_income.innerHTML = total_income;
    head_expense.innerHTML = total_expense;
    head_bal.innerHTML = (total_income - total_expense);

    renderList("all");
}

function clearAll(){
    localStorage.removeItem("data");

    total_income = 0;
    total_expense = 0;
    entries = [];

    head_income.innerHTML = "-";
    head_expense.innerHTML = "-";
    head_bal.innerHTML = "-";

    list.innerHTML = "";
}

LOAD();