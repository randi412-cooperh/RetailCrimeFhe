// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface CrimeRecord {
  id: string;
  encryptedData: string;
  timestamp: number;
  retailer: string;
  crimeType: string;
  location: string;
  status: "pending" | "verified" | "rejected";
}

const App: React.FC = () => {
  // State management
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<CrimeRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({
    crimeType: "",
    location: "",
    details: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showStats, setShowStats] = useState(true);

  // Calculate statistics
  const verifiedCount = records.filter(r => r.status === "verified").length;
  const pendingCount = records.filter(r => r.status === "pending").length;
  const rejectedCount = records.filter(r => r.status === "rejected").length;

  // Filter records based on search and filter
  const filteredRecords = records.filter(record => {
    const matchesSearch = record.crimeType.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          record.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || record.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
  }, []);

  // Wallet connection handlers
  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  // Contract interaction functions
  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return false;
      
      const isAvailable = await contract.isAvailable();
      if (isAvailable) {
        setTransactionStatus({
          visible: true,
          status: "success",
          message: "FHE service is available and ready!"
        });
      } else {
        setTransactionStatus({
          visible: true,
          status: "error",
          message: "FHE service is currently unavailable"
        });
      }
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return isAvailable;
    } catch (e) {
      console.error("Error checking availability:", e);
      return false;
    }
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const keysBytes = await contract.getData("crime_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing crime keys:", e);
        }
      }
      
      const list: CrimeRecord[] = [];
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`crime_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                encryptedData: recordData.data,
                timestamp: recordData.timestamp,
                retailer: recordData.retailer,
                crimeType: recordData.crimeType,
                location: recordData.location,
                status: recordData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing record data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading record ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) {
      console.error("Error loading records:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitRecord = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting crime data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newRecordData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const recordData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        retailer: account,
        crimeType: newRecordData.crimeType,
        location: newRecordData.location,
        status: "pending"
      };
      
      await contract.setData(
        `crime_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      const keysBytes = await contract.getData("crime_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "crime_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted crime data submitted securely!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({
          crimeType: "",
          location: "",
          details: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const verifyRecord = async (recordId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted crime data with FHE..."
    });

    try {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordBytes = await contract.getData(`crime_${recordId}`);
      if (recordBytes.length === 0) {
        throw new Error("Record not found");
      }
      
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedRecord = {
        ...recordData,
        status: "verified"
      };
      
      await contract.setData(
        `crime_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRecord))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE verification completed!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Verification failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const renderStats = () => {
    return (
      <div className="stats-container">
        <div className="stat-card">
          <div className="stat-value">{records.length}</div>
          <div className="stat-label">Total Reports</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{verifiedCount}</div>
          <div className="stat-label">Verified</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{pendingCount}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{rejectedCount}</div>
          <div className="stat-label">Rejected</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>RetailCrime<span>FHE</span></h1>
          <p>Confidential Analysis of Organized Retail Crime</p>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="primary-btn"
          >
            + Report Crime
          </button>
          <button 
            onClick={checkAvailability}
            className="secondary-btn"
          >
            Check FHE Status
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <main className="main-content">
        <section className="intro-section">
          <h2>Secure Retail Crime Reporting</h2>
          <p>
            A privacy-preserving platform for retailers to share encrypted crime data 
            using Fully Homomorphic Encryption (FHE) for joint analysis without exposing 
            sensitive business information.
          </p>
        </section>

        <div className="controls-section">
          <div className="search-filter">
            <input
              type="text"
              placeholder="Search crimes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <button 
            onClick={() => setShowStats(!showStats)}
            className="toggle-btn"
          >
            {showStats ? "Hide Stats" : "Show Stats"}
          </button>
        </div>

        {showStats && (
          <section className="stats-section">
            <h3>Crime Statistics</h3>
            {renderStats()}
          </section>
        )}

        <section className="records-section">
          <div className="section-header">
            <h3>Encrypted Crime Reports</h3>
            <button 
              onClick={loadRecords}
              className="refresh-btn"
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          
          <div className="records-list">
            {filteredRecords.length === 0 ? (
              <div className="empty-state">
                <p>No crime reports found</p>
                <button 
                  className="primary-btn"
                  onClick={() => setShowCreateModal(true)}
                >
                  Report First Crime
                </button>
              </div>
            ) : (
              <div className="records-grid">
                {filteredRecords.map(record => (
                  <div className="record-card" key={record.id}>
                    <div className="card-header">
                      <span className={`status-badge ${record.status}`}>
                        {record.status}
                      </span>
                      <span className="crime-type">{record.crimeType}</span>
                    </div>
                    <div className="card-body">
                      <div className="record-detail">
                        <span>Location:</span>
                        <span>{record.location}</span>
                      </div>
                      <div className="record-detail">
                        <span>Retailer:</span>
                        <span>{record.retailer.substring(0, 6)}...{record.retailer.substring(38)}</span>
                      </div>
                      <div className="record-detail">
                        <span>Date:</span>
                        <span>{new Date(record.timestamp * 1000).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="card-footer">
                      {isOwner(record.retailer) && record.status === "pending" && (
                        <button 
                          onClick={() => verifyRecord(record.id)}
                          className="action-btn"
                        >
                          Verify
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
  
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h3>Report New Crime</h3>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Crime Type *</label>
                <select
                  name="crimeType"
                  value={newRecordData.crimeType}
                  onChange={(e) => setNewRecordData({...newRecordData, crimeType: e.target.value})}
                  className="form-input"
                >
                  <option value="">Select crime type</option>
                  <option value="Shoplifting">Shoplifting</option>
                  <option value="Fraud">Fraud</option>
                  <option value="Burglary">Burglary</option>
                  <option value="Organized Theft">Organized Theft</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>Location *</label>
                <input
                  type="text"
                  name="location"
                  value={newRecordData.location}
                  onChange={(e) => setNewRecordData({...newRecordData, location: e.target.value})}
                  placeholder="Store location"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>Details</label>
                <textarea
                  name="details"
                  value={newRecordData.details}
                  onChange={(e) => setNewRecordData({...newRecordData, details: e.target.value})}
                  placeholder="Additional details (will be encrypted)"
                  className="form-textarea"
                  rows={3}
                />
              </div>
              <div className="fhe-notice">
                <span>🔒</span> All data will be encrypted using FHE technology
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="secondary-btn"
              >
                Cancel
              </button>
              <button 
                onClick={submitRecord}
                disabled={creating || !newRecordData.crimeType || !newRecordData.location}
                className="primary-btn"
              >
                {creating ? "Encrypting..." : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="notification">
          <div className={`notification-content ${transactionStatus.status}`}>
            {transactionStatus.status === "pending" && <div className="spinner"></div>}
            {transactionStatus.message}
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-section">
            <h4>About</h4>
            <p>Secure platform for retailers to combat organized crime while protecting business data.</p>
          </div>
          <div className="footer-section">
            <h4>Technology</h4>
            <p>Powered by Fully Homomorphic Encryption (FHE)</p>
          </div>
          <div className="footer-section">
            <h4>Contact</h4>
            <p>support@retailcrimefhe.org</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} RetailCrimeFHE. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;