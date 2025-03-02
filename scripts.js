/****************************************
 * GLOBAL VARIABLES & MAP SETUP
 ****************************************/
let allData = []; // full data loaded from JSON
let table;        // DataTables instance
let userLat = null, userLng = null;
let userMarker = null; // marker for the user's location
let connectionArc = null; // the connection arc (geodesic)
let selectedRecord = null; // currently selected record
let markerDict = {}; // dictionary for markers keyed by record.Name

const map = L.map('map').setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

/****************************************
 * HELPER FUNCTIONS
 ****************************************/
function getLatLng(record) {
    const lat = parseFloat(record.lat || record.Lat);
    const lng = parseFloat(record.lng || record.Long);
    return [lat, lng];
}

function getFullAddress(record) {
    // First check if we have an Address field
    if (record.Address) return record.Address;

    // Exit early if record doesn't have address properties
    if (!record.Address1 && !record.Address2 && !record.Suburb &&
        !record.State && !record.Postcode && !record.Country) {
        return "Address not available";
    }

    const parts = [];
    if (record.Address1 && record.Address1.trim()) parts.push(record.Address1);
    if (record.Address2 && record.Address2.trim()) parts.push(record.Address2);
    if (record.Suburb && record.Suburb.trim()) parts.push(record.Suburb);
    if (record.State && record.State.trim()) parts.push(record.State);
    if (record.Postcode && record.Postcode.trim()) parts.push(record.Postcode);
    if (record.Country && record.Country.trim()) parts.push(record.Country);

    return parts.length > 0 ? parts.join(", ") : "Address not available";
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function preprocessRecord(record) {
    if (record.Website) {
        let site = record.Website.trim();
        if (site.indexOf(" ") > -1) {
            let parts = site.split(/\s+/);
            record.Website = parts[0];
            if (!record.Email && parts[1] && parts[1].includes("@")) {
                record.Email = parts[1];
            }
        }
    }
    if (record.Email) {
        let emailStr = record.Email.trim();
        if (emailStr.indexOf(" ") > -1) {
            let parts = emailStr.split(/\s+/);
            if ((parts[0].includes("http") || parts[0].includes("www")) && !record.Website) {
                record.Website = parts[0];
            }
            record.Email = parts.slice(1).join(" ");
        }
    }
}

/****************************************
 * DRAW CONNECTION ARC
 ****************************************/
function drawConnectionArc(selectedLat, selectedLng) {
    // Always remove any existing arc.
    if (connectionArc) {
        map.removeLayer(connectionArc);
        connectionArc = null;
    }
    if (userLat !== null && userLng !== null) {
        connectionArc = L.geodesic([[userLat, userLng], [selectedLat, selectedLng]], {
            weight: 3,
            color: 'red',
            opacity: 0.8,
            steps: 50
        }).addTo(map);
    }
}

/****************************************
 * ADD MARKER FOR SELECTED RECORD (if needed)
 ****************************************/
function addMarkerForRecord(record) {
    const [lat, lng] = getLatLng(record);
    if (!isNaN(lat) && !isNaN(lng)) {
        let popupContent = `<table style="border-collapse: collapse; width: 100%;">
    <tr><td colspan="2" style="font-weight: bold; padding: 2px 5px;">${record.Name}</td></tr>
    <tr><td style="padding: 2px 5px;">Address:</td><td style="padding: 2px 5px;">${getFullAddress(record)}</td></tr>`;
        if (record.Phone) {
            popupContent += `<tr><td style="padding: 2px 5px;">Phone:</td><td style="padding: 2px 5px;">${record.Phone}</td></tr>`;
        }
        if (record.Website) {
            popupContent += `<tr><td style="padding: 2px 5px;">Website:</td><td style="padding: 2px 5px;"><a href="${record.Website}" target="_blank">${record.Website}</a></td></tr>`;
        }
        if (record.Updated) {
            popupContent += `<tr><td style="padding: 2px 5px;">Updated:</td><td style="padding: 2px 5px;">${record.Updated}</td></tr>`;
        }
        if (record.Email) {
            popupContent += `<tr><td style="padding: 2px 5px;">Email:</td><td style="padding: 2px 5px;"><a href="mailto:${record.Email}">${record.Email}</a></td></tr>`;
        }
        popupContent += `</table>`;
        let marker = L.marker([lat, lng]).addTo(map).bindPopup(popupContent);
        marker.on('click', function () {
            drawConnectionArc(lat, lng);
        });
        markerDict[record.Name] = marker;
    }
}

/****************************************
 * MAP & TABLE REFRESH FUNCTIONS
 ****************************************/
function refreshMap() {
    // Clear marker dictionary.
    markerDict = {};

    // Remove all markers except userMarker and connectionArc.
    map.eachLayer(layer => {
        if (layer instanceof L.Marker && !layer.options.isUserMarker) {
            map.removeLayer(layer);
        }
    });

    // Get currently visible rows from DataTables (if available).
    let currentData = allData;
    if (table) {
        currentData = table.rows({ page: 'current' }).data().toArray();
    }

    // If selectedRecord isn't in currentData, add it.
    if (selectedRecord) {
        const exists = currentData.some(r => {
            return (r.lat == (selectedRecord.lat || selectedRecord.Lat)) &&
                (r.lng == (selectedRecord.lng || selectedRecord.Long));
        });
        if (!exists) {
            currentData.push(selectedRecord);
        }
    }

    // Zoom: if user location available, center on that; else on first visible record.
    if (userLat !== null && userLng !== null) {
        map.setView([userLat, userLng], 11);
    } else if (currentData.length > 0) {
        const firstRecord = currentData[0];
        const lat = parseFloat(firstRecord.lat);
        const lng = parseFloat(firstRecord.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
            map.setView([lat, lng], 6);
        }
    }

    // Add markers for each record in currentData.
    currentData.forEach(record => {
        const lat = parseFloat(record.lat);
        const lng = parseFloat(record.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
            let popupContent = `<table style="border-collapse: collapse; width: 100%;">
        <tr><td colspan="2" style="font-weight: bold; padding: 2px 5px;">${record.Name}</td></tr>
        <tr><td style="padding: 2px 5px;">Address:</td><td style="padding: 2px 5px;">${getFullAddress(record)}</td></tr>`;
            if (record.Phone) {
                popupContent += `<tr><td style="padding: 2px 5px;">Phone:</td><td style="padding: 2px 5px;">${record.Phone}</td></tr>`;
            }
            if (record.Website) {
                popupContent += `<tr><td style="padding: 2px 5px;">Website:</td><td style="padding: 2px 5px;"><a href="${record.Website}" target="_blank">${record.Website}</a></td></tr>`;
            }
            if (record.Email) {
                popupContent += `<tr><td style="padding: 2px 5px;">Email:</td><td style="padding: 2px 5px;"><a href="mailto:${record.Email}">${record.Email}</a></td></tr>`;
            }
            popupContent += `</table>`;

            let marker = L.marker([lat, lng]).addTo(map).bindPopup(popupContent);
            marker.on('click', function () {
                drawConnectionArc(lat, lng);
            });
            markerDict[record.Name] = marker;
        }
    });

    // Ensure the user marker is present.
    if (userLat !== null && userLng !== null) {
        if (userMarker) {
            userMarker.setLatLng([userLat, userLng]);
        } else {
            var userIcon = L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            });
            userMarker = L.marker([userLat, userLng], {
                icon: userIcon,
                isUserMarker: true,
                title: "Your Location"
            }).addTo(map).bindPopup("Your Location");
        }
    }
}

function buildDataTableRows() {
    return allData.map(record => {
        // Build a compact version of details for the table
        let compactDetails = "";

        // Address part
        let addressParts = [];
        if (record.Address1 && record.Address1.trim()) addressParts.push(record.Address1);

        // Location part (suburb, state, etc)
        let locationPart = "";
        if (record.Suburb) locationPart += record.Suburb;
        if (record.State) locationPart += (locationPart ? ", " : "") + record.State;
        if (record.Postcode) locationPart += (locationPart ? ", " : "") + record.Postcode;
        if (record.Country) locationPart += (locationPart ? ", " : "") + record.Country;

        if (locationPart) addressParts.push(locationPart);

        // Join all parts into a single line
        compactDetails = addressParts.join(", ");

        // For popup and selection, build the full detailed version with line breaks
        let details = "";
        if (record.Address1) {
            details += record.Address1 + "<br>";
        }
        if (record.Address2) {
            details += record.Address2 + "<br>";
        }
        let addressLine = "";
        if (record.Suburb) addressLine += record.Suburb;
        if (record.State) addressLine += (addressLine ? ", " : "") + record.State;
        if (record.Postcode) addressLine += (addressLine ? ", " : "") + record.Postcode;
        if (record.Country) addressLine += (addressLine ? ", " : "") + record.Country;
        if (addressLine) {
            details += addressLine + "<br>";
        }
        if (record.Phone) {
            details += "Phone: " + record.Phone + "<br>";
        }
        if (record.Website) {
            details += 'Website: <a href="' + record.Website + '" target="_blank">' + record.Website + '</a><br>';
        }
        if (record.Updated) {
            details += "Updated: " + record.Updated;
        }

        return {
            Name: record.Name,
            Details: details,
            CompactDetails: compactDetails,
            Distance: (typeof record.distance === 'number') ? record.distance.toFixed(2) : '-',
            lat: record.lat || record.Lat,
            lng: record.lng || record.Long,
            Phone: record.Phone || '',
            Website: record.Website || '',
            Updated: record.Updated || '',
            Email: record.Email || '',
            // Preserve original address fields for marker popups
            Address1: record.Address1 || '',
            Address2: record.Address2 || '',
            Suburb: record.Suburb || '',
            State: record.State || '',
            Postcode: record.Postcode || '',
            Country: record.Country || ''
        };
    });
}

function refreshTable() {
    const rows = buildDataTableRows();
    if (!$.fn.DataTable.isDataTable('#dataTable')) {
        table = $('#dataTable').DataTable({
            data: rows,
            columns: [
                { data: "Name", title: "Name" },
                { data: "CompactDetails", title: "Address" }, // Start with compact view for all rows
                { data: "Distance", title: "Distance (km)" },
                { data: "lat", visible: false },
                { data: "lng", visible: false },
                { data: "Phone", visible: false },
                { data: "Website", visible: false },
                { data: "Updated", visible: false },
                { data: "Email", visible: false },
                { data: "Details", visible: false } // Keep details available but hidden
            ],
            order: [],
            dom: '<"top"lfip>rt<"clear">'
        });

        // Update map when table page, page length, or ordering changes.
        $('#dataTable').on('page.dt length.dt order.dt', function () {
            refreshMap();
        });

        // When a table row is clicked, toggle selection and open the marker's popup.
        $('#dataTable tbody').on('click', 'tr', function () {
            var tableRow = table.row(this);
            var rowData = tableRow.data();
            var lat = parseFloat(rowData.lat);
            var lng = parseFloat(rowData.lng);

            // Check if this row is already selected
            if ($(this).hasClass('selected')) {
                // Deselect this row
                $(this).removeClass('selected');
                selectedRecord = null;

                // Change display back to compact view
                tableRow.cell(this, 1).data(rowData.CompactDetails).draw();

                // Remove connection arc
                if (connectionArc) {
                    map.removeLayer(connectionArc);
                    connectionArc = null;
                }

                refreshMap();
            } else {
                // First, reset any previously selected row
                $('#dataTable tbody tr.selected').each(function () {
                    var prevRow = table.row(this);
                    var prevData = prevRow.data();

                    $(this).removeClass('selected');
                    prevRow.cell(this, 1).data(prevData.CompactDetails);
                });

                // Now select this row
                $(this).addClass('selected');
                selectedRecord = rowData;

                // Change display to detailed view
                tableRow.cell(this, 1).data(rowData.Details).draw();

                // Update map and draw connection arc
                if (!isNaN(lat) && !isNaN(lng)) {
                    if (userLat !== null && userLng !== null) {
                        var bounds = L.latLngBounds([[userLat, userLng], [lat, lng]]);
                        map.fitBounds(bounds, { padding: [50, 50] });
                    } else {
                        map.setView([lat, lng], 11);
                    }

                    drawConnectionArc(lat, lng);

                    // Open the popup for the corresponding marker
                    if (markerDict[rowData.Name]) {
                        markerDict[rowData.Name].openPopup();
                    } else {
                        addMarkerForRecord(rowData);
                    }
                }
            }
        });

    } else {
        table.clear();
        table.rows.add(rows);
        table.draw();
    }
}

function refreshUI() {
    refreshTable();
    refreshMap();
}

/****************************************
 * DISTANCE SORTING & GEOCODING
 ****************************************/
function geocodeAndSort(userAddress) {
    if (!userAddress) return;
    localStorage.setItem('userAddress', userAddress);

    $.get("https://nominatim.openstreetmap.org/search", { q: userAddress, format: "json" }, function (results) {
        if (!results || results.length === 0) {
            alert("Location not found.");
            return;
        }
        userLat = parseFloat(results[0].lat);
        userLng = parseFloat(results[0].lon);
        map.setView([userLat, userLng], 11);

        // Compute distances for each record.
        allData.forEach(record => {
            const [lat, lng] = getLatLng(record);
            record.distance = (!isNaN(lat) && !isNaN(lng))
                ? calculateDistance(userLat, userLng, lat, lng)
                : Infinity;
        });

        // Sort allData by distance.
        allData.sort((a, b) => a.distance - b.distance);
        refreshUI();
        map.setView([userLat, userLng], 11);
    });
}

/****************************************
 * PAGE INITIALIZATION
 ****************************************/
$(document).ready(function () {
    $.getJSON("data.json", function (data) {
        data.forEach(record => {
            preprocessRecord(record);
        });
        allData = data;
        refreshUI();

        const saved = localStorage.getItem('userAddress');
        if (saved) {
            $('#locationInput').val(saved);
            geocodeAndSort(saved);
        }
    }).fail(function (jqXHR, textStatus, errorThrown) {
        console.error("Failed to load JSON data:", textStatus, errorThrown);
    });

    $("#locationInput").autocomplete({
        source: function (req, resp) {
            $.ajax({
                url: "https://nominatim.openstreetmap.org/search",
                dataType: "json",
                data: {
                    q: req.term,
                    format: "json",
                    addressdetails: 1,
                    limit: 5
                },
                success: function (data) {
                    resp($.map(data, function (item) {
                        return {
                            label: item.display_name,
                            value: item.display_name
                        };
                    }));
                }
            });
        },
        minLength: 3,
        select: function (event, ui) {
            geocodeAndSort(ui.item.value);
        }
    });

    $('#sortDistance').click(function () {
        const userLocation = $('#locationInput').val();
        if (!userLocation) {
            alert("Please enter your location.");
            return;
        }
        geocodeAndSort(userLocation);
    });
});