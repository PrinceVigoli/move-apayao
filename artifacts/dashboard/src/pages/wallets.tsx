import React, { useState } from "react"
import { useListWallets, useTopUpWallet, useListUsers } from "@workspace/api-client-react"
import { formatPHP, formatDate } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Wallet as WalletIcon, Search, PlusCircle, ArrowUpRight, ArrowDownLeft, Activity } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

export default function Wallets() {
  const [search, setSearch] = useState("")
  const [selectedUserId, setSelectedUserId] = useState<string>("")
  const [topUpAmount, setTopUpAmount] = useState<string>("")
  const [isTopUpOpen, setIsTopUpOpen] = useState(false)
  const { toast } = useToast()
  
  const { data: usersData } = useListUsers(
    { limit: 100, offset: 0 },
    { query: { queryKey: ["list-users", 100, 0] } }
  )

  const { data: walletsData, isLoading, refetch } = useListWallets(
    { limit: 50, offset: 0 },
    { query: { queryKey: ["list-wallets", 50, 0] } }
  )

  const topUpMutation = useTopUpWallet()

  // Mock data
  const mockWallets = [
    { id: 1, userId: "u1", balance: 5400, updatedAt: new Date().toISOString() },
    { id: 2, userId: "u2", balance: 120, updatedAt: new Date(Date.now() - 3600000).toISOString() },
    { id: 3, userId: "u3", balance: 10500, updatedAt: new Date(Date.now() - 86400000).toISOString() },
    { id: 4, userId: "u4", balance: 0, updatedAt: new Date(Date.now() - 172800000).toISOString() },
  ]

  const mockUsers = [
    { id: "u1", fullName: "System Admin" },
    { id: "u2", fullName: "Maria Clara" },
    { id: "u3", fullName: "Jose Rizal" },
    { id: "u4", fullName: "Banned User" },
  ]

  const wallets = walletsData?.wallets || mockWallets
  const users = usersData?.users || mockUsers

  const enrichedWallets = wallets.map(w => {
    const user = users.find(u => u.id === w.userId)
    return { ...w, userName: user?.fullName || "Unknown User" }
  })

  const filtered = enrichedWallets.filter(w => 
    w.userName.toLowerCase().includes(search.toLowerCase()) || 
    w.userId.toLowerCase().includes(search.toLowerCase())
  )

  const handleTopUp = () => {
    const amount = Number(topUpAmount)
    if (!selectedUserId || isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid input",
        description: "Please select a user and enter a valid positive amount.",
        variant: "destructive"
      })
      return
    }

    topUpMutation.mutate({
      data: { userId: selectedUserId, amount, referenceId: `ADMIN_TOPUP_${Date.now()}` }
    }, {
      onSuccess: () => {
        setIsTopUpOpen(false)
        setTopUpAmount("")
        setSelectedUserId("")
        refetch()
        toast({
          title: "Top-up successful",
          description: `Added ${formatPHP(amount)} to user's wallet.`,
        })
      },
      onError: (err) => {
        toast({
          title: "Top-up failed",
          description: "Could not complete the transaction.",
          variant: "destructive"
        })
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-emerald-600 flex items-center gap-2">
            <WalletIcon className="h-8 w-8" />
            Wallets
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage user balances and transactions.
          </p>
        </div>
        
        <Dialog open={isTopUpOpen} onOpenChange={setIsTopUpOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700">
              <PlusCircle className="h-4 w-4" />
              Manual Top-up
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Funds</DialogTitle>
              <DialogDescription>
                Manually add balance to a user's wallet. This action will be logged.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="user">User</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger id="user">
                    <SelectValue placeholder="Select user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.fullName} ({u.id.substring(0, 8)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="amount">Amount (PHP)</Label>
                <Input 
                  id="amount" 
                  type="number" 
                  min="1" 
                  step="1"
                  placeholder="500" 
                  value={topUpAmount}
                  onChange={e => setTopUpAmount(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTopUpOpen(false)}>Cancel</Button>
              <Button onClick={handleTopUp} disabled={topUpMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                {topUpMutation.isPending ? "Processing..." : "Confirm Top-up"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Total Ecosystem Float</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">
              {formatPHP(filtered.reduce((sum, w) => sum + w.balance, 0))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by user name or ID..."
                className="w-full pl-9 bg-muted/50 border-transparent focus-visible:bg-background focus-visible:border-primary"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Wallet ID</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Last Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-6 w-24 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                    No wallets found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((wallet) => (
                  <TableRow key={wallet.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <div className="font-semibold">{wallet.userName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{wallet.userId.substring(0, 8)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-mono bg-muted/50 px-2 py-1 rounded w-fit text-muted-foreground">
                        W-{wallet.id.toString().padStart(6, '0')}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-bold text-lg">{formatPHP(wallet.balance)}</div>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {formatDate(wallet.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
